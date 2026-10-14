// The proposals flow against a real Postgres. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import postgres from 'postgres';
import './next-stub.mjs';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
let dbName = ''; let P; let data; let raw;
const mails = [];
const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_prop_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url; process.env.SESSION_SECRET = 'test-secret'; delete process.env.RESEND_API_KEY; // mails only land in email_log
  data = await import('../../src/lib/data.ts');
  P = await import('../../src/lib/proposals.ts');
  P.setProposalMailer({ toCandidate: async (id, what) => { mails.push(`candidate:${what}`); }, toCoaches: async (id, what, comment) => { mails.push(`coach:${what}:${comment ?? ''}`); } });
  raw = postgres(url, { max: 2, onnotice: () => {} });
  await raw`insert into coaches (id, name, email) overriding system value values (1, 'Coach', 'coach@example.org')`; // the coach id used below
});
after(async () => {
  if (!admin) return;
  await raw?.end(); const db = await import('../../src/lib/db.ts'); await db.sql().end();
  await admin.unsafe(`drop database if exists ${dbName} with (force)`); await admin.end();
});

async function candidate(branch = 'A') {
  const token = crypto.randomBytes(8).toString('hex');
  const [{ id }] = await raw`insert into candidates (token, name, email, branch, status, current_screen, completed_at)
    values (${token}, 'Test', ${token + '@example.org'}, ${branch}, 'diagnostic_recu', 'done', now() at time zone 'utc') returning id`;
  return id;
}
async function retained(id, n = 3) {
  for (let k = 0; k < n; k++) await raw`insert into tracks (candidate_id, title, format, origin, state, pitch, position) values (${id}, ${'Sujet ' + k}, 'talk', 'ia', 'retenue_coach', ${'Parce que ' + k}, ${k})`;
}
const state = async (id) => (await P.journeyOf(id));
const IDEAS = { approach: ['experience'], other: '', concrete: '', takeaway: '', prepare: '' }; // what she imagines, with her choice

test('A: choice sent (frozen copy), chosen, subject sent, changes asked, sent again, approved, photo, submission', { skip }, async () => {
  mails.length = 0;
  const id = await candidate('A');
  await retained(id, 3);
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  await raw`update tracks set title = 'Modifié après envoi' where candidate_id = ${id}`;
  let j = await state(id);
  assert.equal(j.waiting, 'candidate');
  assert.equal(j.pending.payload.items[0].title, 'Sujet 0', 'frozen copy');
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 1, 'Celui-ci !', IDEAS), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['sujet', 'coach']);
  await raw`insert into subjects (candidate_id, title, abstract, why, plan) values (${id}, 'T1', 'A1', 'Parce que', ${'Accroche\nDémo'}) on conflict (candidate_id) do update set title = excluded.title, abstract = excluded.abstract, why = excluded.why, plan = excluded.plan`;
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual(j.pending.payload, { title: 'T1', abstract: 'A1', why: 'Parce que', plan: ['Accroche', 'Démo'] });
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, ''), { ok: false, error: 'Un commentaire est nécessaire.' });
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, 'Plus court'), { ok: true });
  await raw`update subjects set title = 'T2' where candidate_id = ${id}`;
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'approuvee', null, ''), { ok: true });
  assert.equal((await data.getCandidate(id)).status, 'sujet_valide');
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['photo', 'coach']);
  const [{ id: photoId }] = await raw`insert into photos (candidate_id, filename, mime, size) values (${id}, ${id + '/p.jpg'}, 'image/jpeg', 10) returning id`;
  assert.deepEqual(await P.validatePhoto(id, photoId), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['soumission', 'candidate']);
  assert.deepEqual(await P.confirmSubmission(id), { ok: true });
  assert.equal((await data.getCandidate(id)).status, 'candidature_soumise');
  assert.deepEqual(mails, ['candidate:choix', 'coach:choisie:Celui-ci !', 'candidate:sujet', 'coach:changements:Plus court', 'candidate:sujet', 'coach:approuvee:', 'candidate:pret', 'coach:soumise:']);
});

test('double answer: the second one is refused; an answer to a replaced proposal is refused', { skip }, async () => {
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  const first = (await state(id)).pending.id;
  const [a, b] = await Promise.all([P.answerProposal(id, first, 'approuvee', null, ''), P.answerProposal(id, first, 'approuvee', null, '')]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  const id2 = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id2}, 'T', 'A')`;
  await P.sendSubject(id2, 1);
  const old = (await state(id2)).pending.id;
  assert.deepEqual(await P.sendSubject(id2, 1), { ok: false, error: 'Une proposition attend sa réponse : pistes et sujet restent verrouillés jusqu’à ce qu’elle réponde.' }, 'nothing is sent over a proposal waiting for her answer');
  await raw`update proposals set state = 'remplacee' where id = ${old}`; // a proposal replaced before this rule (or a photo request)
  assert.deepEqual(await P.answerProposal(id2, old, 'approuvee', null, ''), { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' });
});

test('another candidate\'s proposal is refused; a choice needs 2 or 3 retained tracks; photo request and upload', { skip }, async () => {
  const id = await candidate('A');
  await retained(id, 1);
  assert.equal((await P.sendChoice(id, 1)).ok, false);
  await retained(id, 1);
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  const other = await candidate('A');
  assert.deepEqual(await P.answerProposal(other, (await state(id)).pending.id, 'choisie', 0, '', IDEAS), { ok: false, error: 'Proposition introuvable.' });
  const id3 = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id3}, 'T', 'A')`;
  await P.sendSubject(id3, 1);
  await P.answerProposal(id3, (await state(id3)).pending.id, 'approuvee', null, '');
  assert.deepEqual(await P.requestPhoto(id3, 1, ''), { ok: false, error: 'Un commentaire est nécessaire pour demander une autre photo.' });
  assert.deepEqual(await P.requestPhoto(id3, 1, 'Plus lumineuse'), { ok: true });
  assert.equal((await state(id3)).waiting, 'candidate');
  await P.photoUploaded(id3);
  assert.equal((await state(id3)).waiting, 'coach');
});

test('« à traiter » counts unanswered-by-coach answers until the coach sends the next proposal or marks them handled', { skip }, async () => {
  const admin = await import('../../src/lib/admin-data.ts');
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  await raw`update candidates set status = 'sujet_valide' where id = ${id}`; // out of the « intérêt reçu » count (set after the send: sending a subject takes an approved status back)
  const before = await admin.countToProcess();
  await P.answerProposal(id, (await state(id)).pending.id, 'changements', null, 'Non');
  assert.equal(await admin.countToProcess(), before + 1);
  await P.markHandled(id);
  assert.equal(await admin.countToProcess(), before);
});

test('answersToHandle lists unhandled answers once per candidate, oldest first', { skip }, async () => {
  const admin = await import('../../src/lib/admin-data.ts');
  const a = await candidate('C'); const b = await candidate('C');
  for (const id of [a, b]) { await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`; await P.sendSubject(id, 1); }
  await P.answerProposal(b, (await state(b)).pending.id, 'changements', null, 'Non');
  await new Promise((r) => setTimeout(r, 20));
  await P.answerProposal(a, (await state(a)).pending.id, 'approuvee', null, '');
  const mine = (await admin.answersToHandle()).filter((x) => x.id === a || x.id === b);
  assert.deepEqual(mine.map((x) => [x.id, x.responses]), [[b, ['changements']], [a, ['approuvee']]]);
  assert.ok(mine[0].since);
  await P.markHandled(b);
  assert.deepEqual((await admin.answersToHandle()).filter((x) => x.id === b), []);
});

test('an unknown candidate is refused with a message, never a foreign-key error', { skip }, async () => {
  const unknown = { ok: false, error: 'Candidate introuvable' };
  assert.deepEqual(await P.sendChoice(2000000000, 1), unknown);
  assert.deepEqual(await P.sendSubject(2000000000, 1), unknown);
  assert.deepEqual(await P.requestPhoto(2000000000, 1, 'Autre'), unknown);
  assert.deepEqual(await P.validatePhoto(2000000000, 1), unknown);
  assert.deepEqual(await P.sendChoice(NaN, 1), unknown);
  await P.markHandled(3000000000); // no throw
});

test('non-integer ids are refused without throwing', { skip }, async () => {
  const id = await candidate('A');
  assert.deepEqual(await P.answerProposal(id, NaN, 'approuvee', null, ''), { ok: false, error: 'Proposition introuvable.' });
  assert.deepEqual(await P.validatePhoto(id, NaN), { ok: false, error: 'Photo introuvable.' });
  for (const bad of [3000000000, 0, -1]) {
    assert.deepEqual(await P.answerProposal(id, bad, 'approuvee', null, ''), { ok: false, error: 'Proposition introuvable.' });
    assert.deepEqual(await P.validatePhoto(id, bad), { ok: false, error: 'Photo introuvable.' });
  }
});

test('/acces: one email listing every journey of the same mailbox; same answer for an unknown address; rate limited', { skip }, async () => {
  const access = await import('../../src/lib/access.ts');
  const sent = [];
  access.setAccessSender(async (to, entries, loc) => { sent.push({ to, n: entries.length, loc }); });
  const box = `box${crypto.randomBytes(3).toString('hex')}`;
  await raw`insert into candidates (token, name, email, locale) values (${crypto.randomBytes(8).toString('hex')}, 'A', ${box + '@gmail.com'}, 'fr'), (${crypto.randomBytes(8).toString('hex')}, 'A2', ${box + '+x@gmail.com'}, 'fr')`;
  assert.deepEqual(await access.requestAccess(`${box}@gmail.com`, '198.51.100.9'), {});
  assert.deepEqual(sent, [{ to: `${box}@gmail.com`, n: 2, loc: 'fr' }]);
  assert.deepEqual(await access.requestAccess('nobody@example.org', '198.51.100.9'), {});
  assert.equal(sent.length, 1, 'nothing sent for an unknown address');
  let limited;
  for (let k = 0; k < 6 && !limited; k++) limited = (await access.requestAccess(`${box}@gmail.com`, '198.51.100.10')).retryAfterSec;
  assert.ok(limited > 0, 'the address limit applies');
});

test('a proposal unanswered for 48 h gets one reminder, never two', { skip }, async () => {
  const rem = await import('../../src/lib/reminders.ts');
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  await raw`update proposals set sent_at = (now() at time zone 'utc') - interval '49 hours' where candidate_id = ${id}`;
  assert.ok((await rem.remindPendingProposals(new Date())) >= 1);
  const [{ reminded_at }] = await raw`select reminded_at from proposals where candidate_id = ${id}`;
  assert.ok(reminded_at);
  assert.equal(await rem.remindPendingProposals(new Date()), 0, 'second call sends nothing');
  assert.equal((await raw`select count(*)::int as n from email_log where candidate_id = ${id} and kind = 'candidate_proposal_reminder'`)[0].n, 1);
});

async function dueProposal(hours, over = {}) {
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  await raw`update proposals set sent_at = (now() at time zone 'utc') - make_interval(hours => ${hours}) where candidate_id = ${id}`;
  if (over.state) await raw`update proposals set state = ${over.state} where candidate_id = ${id}`;
  if (over.status) await raw`update candidates set status = ${over.status} where id = ${id}`;
  return id;
}
const reminderMails = async (id) => (await raw`select count(*)::int as n from email_log where candidate_id = ${id} and kind = 'candidate_proposal_reminder'`)[0].n;

test('proposal reminders skip what is not due or not open, and parallel runs send once', { skip }, async () => {
  const rem = await import('../../src/lib/reminders.ts');
  const early = await dueProposal(47);
  const replaced = await dueProposal(60, { state: 'remplacee' });
  const answered = await dueProposal(60, { state: 'repondue' });
  const aside = await dueProposal(60, { status: 'non_retenue' });
  const submitted = await dueProposal(60, { status: 'candidature_soumise' });
  const due = await dueProposal(60);
  await Promise.all([rem.remindPendingProposals(new Date()), rem.remindPendingProposals(new Date())]);
  for (const id of [early, replaced, answered, aside, submitted]) assert.equal(await reminderMails(id), 0);
  assert.equal(await reminderMails(due), 1, 'two parallel runs send exactly one email');
});

// ---- final fix wave ---------------------------------------------------------------
async function subjectFor(id, title = 'T', abstract = 'A') {
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, ${title}, ${abstract})
    on conflict (candidate_id) do update set title = excluded.title, abstract = excluded.abstract`;
}

test('I1: one pending proposal across choice and subject; nothing else is sent until she answers', { skip }, async () => {
  const id = await candidate('A');
  await retained(id, 2);
  await subjectFor(id);
  const [x, y] = await Promise.all([P.sendChoice(id, 1), P.sendSubject(id, 1)]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true], 'two sends at once: only one goes');
  await raw`delete from proposals where candidate_id = ${id}`;
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  assert.deepEqual(await P.sendSubject(id, 1), { ok: false, error: 'Une proposition attend sa réponse : pistes et sujet restent verrouillés jusqu’à ce qu’elle réponde.' }, 'a subject waits for her answer to the choice');
  let j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS), { ok: true });
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.pending.kind], ['sujet', 'sujet']);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, 'Pas tout à fait'), { ok: true });
  // the coach goes back to a choice of topics (she chose before, so the exchanges are reopened first): that choice is what /plan shows
  assert.deepEqual(await P.sendChoice(id, 1), { ok: false, error: (await import('../../src/lib/journey.ts')).TRACKS_CLOSED_MESSAGE }, 'she chose among the tracks sent: another series only after reopening');
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.waiting, j.pending.kind], ['choix', 'candidate', 'choix']);
  assert.equal((await raw`select count(*)::int as n from proposals where candidate_id = ${id} and state = 'envoyee'`)[0].n, 1);
});

test('the topic is locked while a proposal waits, after she approved, once submitted; « Rouvrir » lifts approved and submitted', { skip }, async () => {
  const id = await candidate('C');
  await subjectFor(id);
  assert.equal(await P.exchangeLock(id), null);
  await P.sendSubject(id, 1);
  assert.equal(await P.exchangeLock(id), 'attente');
  assert.deepEqual(await P.reopenExchanges(id), { ok: false, error: 'Une proposition attend sa réponse : pistes et sujet restent verrouillés jusqu’à ce qu’elle réponde.' });
  let j = await state(id);
  await P.answerProposal(id, j.pending.id, 'changements', null, 'Plus court');
  assert.equal(await P.exchangeLock(id), null, 'changes asked: the coach has the hand again');
  await P.sendSubject(id, 1);
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'approuvee', null, '');
  assert.equal(await P.exchangeLock(id), 'approuve');
  assert.equal((await P.sendSubject(id, 1)).ok, false, 'an approved subject is not sent again before reopening');
  assert.deepEqual(await P.reopenExchanges(id), { ok: true });
  assert.equal(await P.exchangeLock(id), null);
  await new Promise((r) => setTimeout(r, 1100)); // timestamps are kept to the second: her next answer comes after the reopening
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'approuvee', null, '');
  assert.equal(await P.exchangeLock(id), 'approuve', 'approved again after reopening: locked again');
  await raw`update candidates set submitted_at = now() at time zone 'utc' where id = ${id}`;
  assert.equal(await P.exchangeLock(id), 'soumise');
});

test('I2: a candidate counts as submitted by submitted_at, by « already submitted / accepted », or by a status at or past « candidature soumise »', { skip }, async () => {
  const byState = await candidate('D');
  await raw`insert into subjects (candidate_id, title, abstract, application_state) values (${byState}, 'T', 'A', 'soumise')`;
  assert.deepEqual([(await state(byState)).step, (await state(byState)).waiting], ['soumise', 'none']);
  const accepted = await candidate('D');
  await raw`insert into subjects (candidate_id, title, abstract, application_state) values (${accepted}, 'T', 'A', 'retenue')`;
  assert.equal((await state(accepted)).step, 'soumise');
  for (const status of ['candidature_soumise', 'retenue', 'slides_validees', 'repetition_faite', 'jour_j']) {
    const id = await candidate('C');
    await raw`update candidates set status = ${status} where id = ${id}`;
    assert.equal((await state(id)).step, 'soumise', status);
  }
  for (const status of ['diagnostic_recu', 'sujet_valide', 'non_retenue']) {
    const id = await candidate('C');
    await raw`update candidates set status = ${status} where id = ${id}`;
    assert.equal((await state(id)).step, 'sujet', status);
  }
  const toSubmit = await candidate('D');
  await raw`insert into subjects (candidate_id, title, abstract, application_state) values (${toSubmit}, 'T', 'A', 'a_soumettre')`;
  assert.equal((await state(toSubmit)).step, 'sujet');
});

test('I1/I2: nothing can be sent once she counts as submitted', { skip }, async () => {
  const done = { ok: false, error: 'La candidature est déjà soumise.' };
  const id = await candidate('A');
  await retained(id, 2);
  await subjectFor(id);
  await raw`update subjects set application_state = 'soumise' where candidate_id = ${id}`;
  assert.deepEqual(await P.sendChoice(id, 1), done);
  assert.deepEqual(await P.sendSubject(id, 1), done);
  assert.deepEqual(await P.requestPhoto(id, 1, 'Autre'), done);
  const byStatus = await candidate('C');
  await subjectFor(byStatus);
  await raw`update candidates set status = 'retenue' where id = ${byStatus}`;
  assert.deepEqual(await P.sendSubject(byStatus, 1), done);
  const confirmed = await candidate('C');
  await subjectFor(confirmed);
  await raw`update candidates set submitted_at = now() at time zone 'utc' where id = ${confirmed}`;
  assert.deepEqual(await P.requestPhoto(confirmed, 1, 'Autre'), done);
  assert.equal((await raw`select count(*)::int as n from proposals where candidate_id in (${id}, ${byStatus}, ${confirmed})`)[0].n, 0);
});

test('« Rouvrir les échanges »: the coach can send again after her confirmation or a status moved forward; she confirms again at the end', { skip }, async () => {
  const open = await candidate('C');
  assert.deepEqual(await P.reopenExchanges(open), { ok: false, error: 'Les échanges sont déjà ouverts.' });
  assert.deepEqual(await P.reopenExchanges(2000000000), { ok: false, error: 'Candidate introuvable' });
  const id = await candidate('C');
  await subjectFor(id);
  await raw`update candidates set submitted_at = now() at time zone 'utc', status = 'retenue' where id = ${id}`;
  await raw`update subjects set application_state = 'retenue' where candidate_id = ${id}`;
  assert.equal((await state(id)).step, 'soumise');
  assert.deepEqual(await P.reopenExchanges(id), { ok: true });
  assert.notEqual((await state(id)).step, 'soumise', 'neither the form answer nor the status counts once reopened');
  assert.deepEqual(await P.requestPhoto(id, 1, 'Une photo plus récente'), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'retenue', 'her status does not move back');
  await raw`update candidates set submitted_at = now() at time zone 'utc' where id = ${id}`;
  assert.equal((await state(id)).step, 'soumise', 'her new confirmation closes them again');
});

test('the statuses the exchanges drive follow them back: reopening, a new subject over an approved one; « retenue » is never touched', { skip }, async () => {
  const hist = async (id) => (await raw`select old_status, new_status, author from status_history where candidate_id = ${id} order by id`).map((h) => `${h.old_status}>${h.new_status} (${h.author})`);
  const id = await candidate('C');
  await subjectFor(id);
  await P.sendSubject(id, 1);
  await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'sujet_valide');
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'sujet_valide', 'the approval still stands after reopening');
  // a new subject sent over the approved one: not validated while it waits for her
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'diagnostic_recu');
  assert.deepEqual(await hist(id), ['diagnostic_recu>sujet_valide (la candidate)', 'sujet_valide>diagnostic_recu (Coach)']);
  // she answers: forward again
  await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'sujet_valide');
  // submitted, then reopened: back to what the exchanges stand for (the approved subject, the photo to come)
  await raw`update candidates set submitted_at = now() at time zone 'utc', status = 'candidature_soumise' where id = ${id}`;
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'sujet_valide');
  // what happened at the event is not the exchanges' to undo
  const won = await candidate('C');
  await raw`update candidates set submitted_at = now() at time zone 'utc', status = 'slides_validees' where id = ${won}`;
  assert.deepEqual(await P.reopenExchanges(won, 'Coach'), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${won}`)[0].status, 'slides_validees');
  // A: a choice sent over an approved subject takes the status back to the start
  const a = await candidate('A');
  await retained(a, 2);
  await P.sendChoice(a, 1);
  await P.answerProposal(a, (await state(a)).pending.id, 'choisie', 0, '', IDEAS);
  await subjectFor(a);
  await P.sendSubject(a, 1);
  await P.answerProposal(a, (await state(a)).pending.id, 'approuvee', null, '');
  assert.equal((await raw`select status from candidates where id = ${a}`)[0].status, 'sujet_valide');
  assert.deepEqual(await P.reopenExchanges(a, 'Coach'), { ok: true });
  assert.deepEqual(await P.sendChoice(a, 1), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${a}`)[0].status, 'diagnostic_recu');
});

test('« Suivi »: a status that is passed is refused (against the database), the ones ahead are accepted, « non retenue » can be taken back', { skip }, async () => {
  const S = await import('../../src/lib/status.ts');
  const id = await candidate('C');
  assert.equal(await S.statusRefusal(id, 'diagnostic_recu'), null, 'the status it already has');
  assert.equal(await S.statusRefusal(id, 'jour_j'), null, 'ahead');
  assert.equal(await S.statusRefusal(id, 'non_retenue'), null, 'the exit');
  assert.match(await S.statusRefusal(id, 'en_cours'), /dépassé/);
  assert.match(await S.statusRefusal(id, 'sujet_valide'), /titre et le résumé/, 'no subject to validate');
  await subjectFor(id);
  assert.equal(await S.statusRefusal(id, 'sujet_valide'), null, 'with a title and an abstract');
  await raw`update candidates set status = 'retenue' where id = ${id}`;
  for (const behind of ['en_cours', 'diagnostic_recu', 'sujet_valide', 'candidature_soumise']) assert.match(await S.statusRefusal(id, behind), /Rouvrir les échanges/, behind);
  assert.equal(await S.statusRefusal(id, 'slides_validees'), null);
  await raw`update candidates set status = 'non_retenue' where id = ${id}`;
  assert.equal(await S.statusRefusal(id, 'diagnostic_recu'), null, 'taken back to « Intérêt reçu »');
  assert.match(await S.statusRefusal(id, 'retenue'), /seul « Intérêt reçu »/);
  const unfinished = (await raw`insert into candidates (token, name, branch, status, current_screen) values (${crypto.randomBytes(8).toString('hex')}, 'Pas finie', 'A', 'en_cours', 'p1') returning id`)[0].id;
  assert.match(await S.statusRefusal(unfinished, 'diagnostic_recu'), /formulaire n’est pas terminé/);
  assert.equal(await S.statusRefusal(unfinished, 'non_retenue'), null);
  // an unfinished form that was set to « Non retenue » is taken back to « En cours », never to « Intérêt reçu » (the detour would bypass the rule)
  await raw`update candidates set status = 'non_retenue' where id = ${unfinished}`;
  assert.equal(await S.statusRefusal(unfinished, 'en_cours'), null);
  assert.match(await S.statusRefusal(unfinished, 'diagnostic_recu'), /seul « En cours »/);
  assert.equal(await S.statusRefusal(999999999, 'jour_j'), 'Candidate introuvable');
  // a finished form at « En cours » (reset by hand) moves on again
  const reset = await candidate('C');
  await raw`update candidates set status = 'en_cours' where id = ${reset}`;
  assert.equal(await S.statusRefusal(reset, 'diagnostic_recu'), null);
});

test('« Suivi »: « Sujet validé » needs a real title and abstract', { skip }, async () => {
  const S = await import('../../src/lib/status.ts');
  const id = await candidate('C');
  const needs = /titre et le résumé/;
  for (const [title, abstract] of [['  ', 'A'], ['T', ''], ['T', '   '], ['', '']]) {
    await subjectFor(id, title, abstract);
    assert.match(await S.statusRefusal(id, 'sujet_valide'), needs, JSON.stringify([title, abstract]));
  }
  await subjectFor(id, 'T', 'A');
  assert.equal(await S.statusRefusal(id, 'sujet_valide'), null);
});

test('« Suivi »: a status set by hand ahead of the exchanges can be put back in sync; the way back is named only where it exists', { skip }, async () => {
  const S = await import('../../src/lib/status.ts');
  const id = await candidate('C');
  await subjectFor(id);
  await raw`update candidates set status = 'sujet_valide' where id = ${id}`; // by hand: she has approved nothing
  assert.equal((await state(id)).step, 'sujet');
  assert.equal(await S.statusRefusal(id, 'diagnostic_recu'), null, 'back to what the exchanges stand for');
  assert.doesNotMatch(await S.statusRefusal(id, 'en_cours'), /Rouvrir/, 'no reopening is possible here: it is not offered as the way back');
  // her real approval: the status stands, the way back is « Rouvrir »
  await P.sendSubject(id, 1);
  await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'sujet_valide');
  const refusal = await S.statusRefusal(id, 'diagnostic_recu');
  assert.match(refusal, /dépassé/);
  assert.match(refusal, /Rouvrir les échanges/);
});

test('a status set by hand to « Candidature soumise » over a proposal still waiting: « Rouvrir » is the way back, and she can answer again', { skip }, async () => {
  const id = await candidate('C');
  await subjectFor(id);
  await P.sendSubject(id, 1);
  assert.equal(await P.exchangeLock(id), 'attente');
  await raw`update candidates set status = 'candidature_soumise' where id = ${id}`; // she submitted outside the app
  assert.equal(await P.exchangeLock(id), 'soumise', 'submitted comes first: the reopening is available');
  assert.equal((await state(id)).step, 'soumise');
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  const j = await state(id);
  assert.deepEqual([j.step, j.waiting, !!j.pending], ['sujet', 'candidate', true], 'her proposal is back in front of her');
  assert.equal((await raw`select status from candidates where id = ${id}`)[0].status, 'diagnostic_recu');
  assert.equal(await P.exchangeLock(id), 'attente');
});

test('reopening after a real submission: « Candidature soumise » goes back to « Sujet validé », an approval with a validated photo keeps it', { skip }, async () => {
  const hist = async (id) => (await raw`select old_status, new_status, author from status_history where candidate_id = ${id} order by id`).map((h) => `${h.old_status}>${h.new_status} (${h.author})`);
  const real = async () => {
    const id = await candidate('C');
    await subjectFor(id);
    await P.sendSubject(id, 1);
    await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
    const [{ id: photoId }] = await raw`insert into photos (candidate_id, filename, mime, size, width, height) values (${id}, 'p.jpg', 'image/jpeg', 10, 100, 100) returning id`;
    assert.deepEqual(await P.validatePhoto(id, photoId), { ok: true });
    assert.equal((await state(id)).step, 'soumission');
    return id;
  };
  // the subject is approved and the photo validated: reopening changes nothing to the status
  const approved = await real();
  assert.deepEqual(await P.reopenExchanges(approved, 'Coach'), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${approved}`)[0].status, 'sujet_valide');
  // she confirmed her submission
  const submitted = await real();
  assert.deepEqual(await P.confirmSubmission(submitted), { ok: true });
  assert.equal((await raw`select status from candidates where id = ${submitted}`)[0].status, 'candidature_soumise');
  assert.deepEqual(await P.reopenExchanges(submitted, 'Coach'), { ok: true });
  assert.equal((await state(submitted)).step, 'soumission');
  assert.equal((await raw`select status from candidates where id = ${submitted}`)[0].status, 'sujet_valide');
  assert.equal((await hist(submitted)).at(-1), 'candidature_soumise>sujet_valide (Coach)');
});

test('her first photo at the photo step tells the coach even when no photo was asked; not before the subject is approved', { skip }, async () => {
  const early = await candidate('C');
  mails.length = 0;
  await P.photoUploaded(early);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(mails, [], 'no subject approved yet: nothing to validate');
  const id = await candidate('C');
  await subjectFor(id);
  await P.sendSubject(id, 1);
  const j = await state(id);
  await P.answerProposal(id, j.pending.id, 'approuvee', undefined, '');
  assert.equal((await state(id)).step, 'photo');
  mails.length = 0;
  await P.photoUploaded(id);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(mails, ['coach:photo_deposee:']);
});

test('I3: the validation of a photo goes when the selected photo changes, is un-selected or is deleted', { skip }, async () => {
  const photos = await import('../../src/lib/photos.ts');
  const id = await candidate('C');
  const add = async (n) => (await raw`insert into photos (candidate_id, filename, mime, size) values (${id}, ${`${id}/missing-${n}.jpg`}, 'image/jpeg', 10) returning id`)[0].id;
  const validated = async () => (await raw`select photo_validated_at, selected_photo_id from candidates where id = ${id}`)[0];
  const [a, b] = [await add(1), await add(2)];
  await P.validatePhoto(id, a);
  await photos.selectPhoto(id, a); // the same photo: the validation stays
  assert.ok((await validated()).photo_validated_at);
  await photos.selectPhoto(id, b);
  assert.deepEqual(await validated(), { photo_validated_at: null, selected_photo_id: b });
  await P.validatePhoto(id, b);
  await photos.selectPhoto(id, null);
  assert.deepEqual(await validated(), { photo_validated_at: null, selected_photo_id: null });
  await P.validatePhoto(id, a);
  await photos.deletePhoto(id, b); // not the selected one: the validation stays
  assert.ok((await validated()).photo_validated_at);
  await photos.deletePhoto(id, a);
  assert.deepEqual(await validated(), { photo_validated_at: null, selected_photo_id: null });
});

test('I4 and M2: « tout est prêt » carries the approved frozen copy; the coach email names the chosen topic', { skip }, async () => {
  const { realMailer } = await import('../../src/lib/proposals-mailer.ts');
  const id = await candidate('A');
  await raw`update candidates set coach_id = 1 where id = ${id}`;
  await retained(id, 2);
  await P.sendChoice(id, 1);
  await P.answerProposal(id, (await state(id)).pending.id, 'choisie', 1, '', IDEAS);
  await realMailer.toCoaches(id, 'choisie', null);
  const [coachMail] = await raw`select subject, body_text from email_log where candidate_id = ${id} and kind = 'coach_answer_choisie' order by id desc limit 1`;
  assert.match(coachMail.subject, /Sujet 1/);
  await subjectFor(id, 'Titre approuvé', 'Résumé approuvé');
  await P.sendSubject(id, 1);
  await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
  await subjectFor(id, 'Titre retouché après', 'Résumé retouché après');
  await realMailer.toCandidate(id, 'pret');
  const [ready] = await raw`select body_text from email_log where candidate_id = ${id} and kind = 'candidate_proposal_pret' order by id desc limit 1`;
  assert.ok(ready.body_text.includes('Titre approuvé') && ready.body_text.includes('Résumé approuvé'), ready.body_text);
  assert.ok(!ready.body_text.includes('retouché'));
});

test('A and B: the subject is sent only once she has chosen one of the tracks sent', { skip }, async () => {
  const needs = { ok: false, error: 'Envoie d’abord les pistes retenues : le sujet se développe à partir de celle qu’elle choisit.' };
  const id = await candidate('B');
  await retained(id, 2);
  await subjectFor(id);
  assert.deepEqual(await P.sendSubject(id, 1), needs);
  await P.sendChoice(id, 1);
  let j = await state(id);
  await P.answerProposal(id, j.pending.id, 'aucune', null, 'Aucune ne me parle');
  assert.deepEqual(await P.sendSubject(id, 1), needs, '« aucune »: still no chosen track');
  await P.sendChoice(id, 1);
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'choisie', 1, '', IDEAS);
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  const cd = await candidate('C');
  await subjectFor(cd);
  assert.deepEqual(await P.sendSubject(cd, 1), { ok: true }, 'C and D send their subject directly');
});

test('A and B: « aucune » to a second round of tracks puts the choice back, whatever she chose in the first', { skip }, async () => {
  const id = await candidate('A');
  await retained(id, 2);
  await subjectFor(id);
  assert.equal((await P.sendChoice(id, 1)).ok, true);
  let j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS), { ok: true });
  assert.equal((await P.mayChooseTrack(id)).ok, true, 'she chose');
  // the coach starts again (she chose, so the exchanges are reopened first): new tracks, none of which suits her
  assert.equal((await P.reopenExchanges(id, 'Coach')).ok, true);
  assert.equal((await P.sendChoice(id, 1)).ok, true);
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'aucune', null, 'Aucune ne me parle'), { ok: true });
  assert.equal((await state(id)).step, 'choix');
  assert.equal((await P.mayChooseTrack(id)).ok, false, 'she is back at the choice: « Choisir » waits for her again');
  assert.equal((await P.sendSubject(id, 1)).ok, false, 'and so does the send of the subject');
  assert.equal(P.needsChoice('A', []), true);
  assert.equal(P.needsChoice('C', []), false);
  // she chooses in the second round: allowed again
  assert.equal((await P.sendChoice(id, 1)).ok, true);
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 1, '', IDEAS), { ok: true });
  assert.equal((await P.mayChooseTrack(id)).ok, true);
  assert.equal((await P.sendSubject(id, 1)).ok, true);
});

test('« Choisir » is refused until she has chosen (A and B), then allowed; C and D are not concerned', { skip }, async () => {
  const a = await candidate('A');
  assert.equal((await P.mayChooseTrack(a)).ok, false, 'nothing sent yet');
  assert.match((await P.mayChooseTrack(a)).error, /choisit elle-même/);
  await retained(a, 2);
  assert.deepEqual(await P.sendChoice(a, 1), { ok: true });
  assert.equal((await P.mayChooseTrack(a)).ok, false, 'sent, waiting for her answer');
  let j = await state(a);
  assert.deepEqual(await P.answerProposal(a, j.pending.id, 'aucune', null, 'Aucun ne me parle'), { ok: true });
  assert.equal((await P.mayChooseTrack(a)).ok, false, 'none suited her: the coach keeps, edits and sends again');
  assert.deepEqual(await P.sendChoice(a, 1), { ok: true });
  j = await state(a);
  assert.deepEqual(await P.answerProposal(a, j.pending.id, 'choisie', 0, '', IDEAS), { ok: true });
  assert.deepEqual(await P.mayChooseTrack(a), { ok: true });
  assert.equal((await P.mayChooseTrack(await candidate('C'))).ok, true);
  assert.equal((await P.mayChooseTrack(999999999)).ok, false, 'unknown candidate');
});

test('the list shows where the exchanges stand for each candidate, as her fiche does', { skip }, async () => {
  const A = await import('../../src/lib/admin-data.ts');
  const fresh = await candidate('A');
  const sent = await candidate('A'); await retained(sent, 2); await P.sendChoice(sent, 1);
  const withSubject = await candidate('C'); await raw`insert into subjects (candidate_id, title, abstract) values (${withSubject}, 'T', 'A')`; await P.sendSubject(withSubject, 1);
  const unfinished = (await raw`insert into candidates (token, name, branch, status, current_screen) values (${crypto.randomBytes(8).toString('hex')}, 'Pas finie', 'A', 'en_cours', 'p1') returning id`)[0].id;
  const submittedByStatus = await candidate('C'); await raw`update candidates set status = 'candidature_soumise' where id = ${submittedByStatus}`;
  const declined = await candidate('A'); await raw`update candidates set status = 'non_retenue' where id = ${declined}`;
  const reopened = await candidate('C'); await raw`update candidates set status = 'candidature_soumise', reopened_at = now() at time zone 'utc' where id = ${reopened}`;
  // approved subject, no photo yet / a photo uploaded and validated
  const noPhoto = await candidate('C'); await raw`insert into subjects (candidate_id, title, abstract) values (${noPhoto}, 'T', 'A')`; await P.sendSubject(noPhoto, 1);
  await P.answerProposal(noPhoto, (await state(noPhoto)).pending.id, 'approuvee', null, '');
  const validated = await candidate('C'); await raw`insert into subjects (candidate_id, title, abstract) values (${validated}, 'T', 'A')`; await P.sendSubject(validated, 1);
  await P.answerProposal(validated, (await state(validated)).pending.id, 'approuvee', null, '');
  const [{ id: photoId }] = await raw`insert into photos (candidate_id, filename, mime, size, width, height) values (${validated}, 'p.jpg', 'image/jpeg', 10, 100, 100) returning id`;
  await raw`update candidates set selected_photo_id = ${photoId}, photo_validated_at = now() at time zone 'utc' where id = ${validated}`;
  const photoUp = await candidate('C'); await raw`insert into subjects (candidate_id, title, abstract) values (${photoUp}, 'T', 'A')`; await P.sendSubject(photoUp, 1);
  await P.answerProposal(photoUp, (await state(photoUp)).pending.id, 'approuvee', null, '');
  await raw`insert into photos (candidate_id, filename, mime, size, width, height) values (${photoUp}, 'q.jpg', 'image/jpeg', 10, 100, 100)`;
  const rows = await A.candidateRows();
  const label = (id) => rows.find((r) => r.id === id)?.journey;
  assert.deepEqual(label(fresh), { label: 'Rien envoyé', waiting: 'coach' });
  assert.deepEqual(label(sent), { label: 'Pistes proposées', waiting: 'candidate' });
  assert.deepEqual(label(withSubject), { label: 'Sujet proposé', waiting: 'candidate' });
  assert.equal(label(unfinished), null, 'her form is not finished: nothing to show');
  assert.equal(label(declined), null, 'not retained: nothing to show');
  assert.deepEqual(label(submittedByStatus), { label: 'Candidature soumise', waiting: 'none' });
  assert.equal(label(reopened).label, 'Rien envoyé', 'reopened: only her own confirmation counts as submitted again');
  assert.deepEqual(label(noPhoto), { label: 'Sujet approuvé · photo à demander', waiting: 'coach' });
  assert.deepEqual(label(photoUp), { label: 'Sujet approuvé · photo à traiter', waiting: 'coach' });
  assert.deepEqual(label(validated), { label: 'Attend sa soumission', waiting: 'candidate' });
  // the list and the fiche read the same thing: same wording, same hand
  const { journeyState } = await import('../../src/lib/journey.ts');
  const photoCount = async (id) => (await raw`select count(*)::int as n from photos where candidate_id = ${id}`)[0].n;
  for (const id of [fresh, sent, withSubject, submittedByStatus, reopened, noPhoto, photoUp, validated]) {
    const j = await P.journeyOf(id);
    assert.deepEqual(label(id), journeyState(j, await P.listProposals(id), await photoCount(id)), `candidate ${id}`);
  }
});

test('resume code: sent with the links, opens her unfinished journey once; wrong tries count, five void it; it expires', { skip }, async () => {
  const access = await import('../../src/lib/access.ts');
  const rc = await import('../../src/lib/resume-code.ts');
  const sent = [];
  access.setAccessSender(async (to, entries, loc, code) => { sent.push({ to, code, first: entries[0].url }); });
  const box = `rc${crypto.randomBytes(3).toString('hex')}`;
  const [done, open] = [crypto.randomBytes(8).toString('hex'), crypto.randomBytes(8).toString('hex')];
  await raw`insert into candidates (token, name, email, locale, completed_at) values (${done}, 'Fini', ${box + '@gmail.com'}, 'en', now() at time zone 'utc')`;
  await raw`insert into candidates (token, name, email, locale) values (${open}, 'En cours', ${box.slice(0, 2) + '.' + box.slice(2) + '@gmail.com'}, 'en')`; // same mailbox (Gmail ignores dots)
  await access.requestAccess(`${box}@gmail.com`, '198.51.100.20');
  assert.equal(sent.length, 1);
  assert.match(sent[0].code, /^\d{6}$/);
  assert.ok(sent[0].first.endsWith(open), `the unfinished journey comes first (the code opens it): ${sent[0].first} vs ${open}`);
  const code = sent[0].code;
  const wrong = code === '000000' ? '111111' : '000000';
  assert.deepEqual(await rc.verifyCode(`${box}@gmail.com`, wrong, '198.51.100.21'), { wrong: true });
  assert.deepEqual(await rc.verifyCode(`${box}@gmail.com`, code.slice(0, 3) + ' ' + code.slice(3), '198.51.100.21'), { token: open, completed: false }, 'spaces are ignored');
  assert.deepEqual(await rc.verifyCode(`${box}@gmail.com`, code, '198.51.100.21'), { wrong: true }, 'a code works once');
  // five wrong tries void the live code
  const id = (await raw`select id from candidates where token = ${open}`)[0].id;
  const fresh = await rc.issueCode(id);
  const bad = fresh === '000000' ? '111111' : '000000';
  for (let k = 0; k < 5; k++) await rc.verifyCode(`${box}@gmail.com`, bad, '198.51.100.22');
  assert.deepEqual(await rc.verifyCode(`${box}@gmail.com`, fresh, '198.51.100.22'), { wrong: true }, 'void after five wrong tries');
  const late = await rc.issueCode(id);
  await raw`update resume_codes set expires_at = (now() at time zone 'utc') - interval '1 minute' where candidate_id = ${id} and used_at is null`;
  assert.deepEqual(await rc.verifyCode(`${box}@gmail.com`, late, '198.51.100.23'), { wrong: true }, 'expired');
  assert.deepEqual(await rc.verifyCode('nobody@example.org', '123456', '198.51.100.23'), { wrong: true });
});

test('the first screen does not start a second journey for an address that has one; another is allowed once all are finished', { skip }, async () => {
  const access = await import('../../src/lib/access.ts');
  const diag = await import('../../src/lib/diagnostic.ts');
  const sent = [];
  access.setAccessSender(async (to, entries, loc, code) => { sent.push(code); });
  const box = `dup${crypto.randomBytes(3).toString('hex')}`;
  await raw`insert into devfest_events (city, name, event_date) values ('douala', 'Douala', to_char(current_date + 60, 'YYYY-MM-DD')) on conflict (city) do update set event_date = excluded.event_date`; // an event the form still offers, whatever the day the tests run
  const profile = { P1: 'Awa Test', P2: 'douala', P3: '+237 612 345 678', P4: `${box}@example.org`, P6: 'étudiante', P7: '1-3' };
  const first = await diag.submitScreen(null, 'profile', profile, 'fr', '198.51.100.30');
  assert.equal(first.ok, true, JSON.stringify(first));
  const again = await diag.submitScreen(null, 'profile', { ...profile, P4: `${box.toUpperCase()}@example.org` }, 'fr', '198.51.100.31');
  assert.deepEqual(again, { ok: false, errors: {}, fatal: 'resume_needed', canStartNew: false });
  assert.equal(sent.length, 1, 'she receives her code and links');
  assert.equal((await diag.submitScreen(null, 'profile', profile, 'fr', '198.51.100.31', true)).fatal, 'resume_needed', 'no second journey while one is unfinished');
  await raw`update candidates set completed_at = now() at time zone 'utc' where token = ${first.token}`;
  assert.equal((await diag.submitScreen(null, 'profile', profile, 'fr', '198.51.100.32')).canStartNew, true);
  const other = await diag.submitScreen(null, 'profile', profile, 'fr', '198.51.100.32', true);
  assert.equal(other.ok, true, 'another event, once all hers are finished, when she asks');
  assert.equal((await raw`select count(*)::int as n from candidates where lower(email) = ${box + '@example.org'}`)[0].n, 2);
});

test('her choice carries what she imagines: required (one way to approach it), kept, shown to the coach by email', { skip }, async () => {
  mails.length = 0;
  const id = await candidate('A');
  await retained(id, 2);
  await P.sendChoice(id, 1);
  const j = await state(id);
  const need = { ok: false, error: 'Dis-nous comment tu aimerais aborder ce sujet (au moins une case, ou en quelques mots).' };
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, ''), need, 'no ideas');
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, '', { approach: ['nope'], other: '  ' }), need, 'unknown approach only');
  assert.equal((await P.answerProposal(id, j.pending.id, 'choisie', 0, '', { approach: ['demo'], concrete: 'x'.repeat(601) })).ok, false, 'too long');
  const ideas = { approach: ['demo', 'erreurs', 'demo'], other: '', concrete: 'Mon app de covoiturage', takeaway: 'Tester tôt', prepare: 'Une démo enregistrée' };
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, 'Merci !', ideas), { ok: true });
  const kept = (await P.listProposals(id)).find((x) => x.id === j.pending.id).response_data;
  assert.deepEqual(kept, { approach: ['demo', 'erreurs'], other: '', concrete: 'Mon app de covoiturage', takeaway: 'Tester tôt', prepare: 'Une démo enregistrée' });
  // a « aucune » answer carries none
  const id2 = await candidate('B');
  await retained(id2, 2);
  await P.sendChoice(id2, 1);
  await P.answerProposal(id2, (await state(id2)).pending.id, 'aucune', null, 'Aucune', ideas);
  assert.equal((await P.listProposals(id2))[0].response_data, null);
});

test('the menu figure is the work left: an approval whose photo is already validated asks nothing of the coach (candidate 4)', { skip }, async () => {
  const admin = await import('../../src/lib/admin-data.ts');
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  const base = (await admin.countToProcess()) - 1; // this new interest is counted
  const counted = async () => (await admin.countToProcess()) === base + 1;
  assert.equal(await counted(), true, 'new interest, nothing sent: counted');
  await P.sendSubject(id, 1);
  assert.equal(await counted(), false, 'sent: she has the hand');
  await P.answerProposal(id, (await state(id)).pending.id, 'approuvee', null, '');
  assert.equal(await counted(), true, 'approved, no photo: the coach has to ask for one');
  const [{ id: photo }] = await raw`insert into photos (candidate_id, filename, mime, size) values (${id}, ${id + '/p.jpg'}, 'image/jpeg', 10) returning id`;
  await P.validatePhoto(id, photo);
  assert.equal((await state(id)).step, 'soumission');
  assert.equal(await counted(), false, 'photo validated: she submits, nothing left for the coach');
  await raw`update proposals set handled_at = null where candidate_id = ${id}`;
  assert.equal(await counted(), false, 'even with her approval left unhandled');
});

test('dashboard notifications: what the coaches were emailed, once per event, the last two weeks, newest first', { skip }, async () => {
  const admin = await import('../../src/lib/admin-data.ts');
  const id = await candidate('C');
  const subject = `Test ${id} a choisi un sujet`;
  await raw`insert into email_log (kind, to_addr, subject, body_text, status, candidate_id, at) values
    ('coach_answer_choisie', 'a@example.org', ${subject}, 'x', 'logged', ${id}, now() at time zone 'utc'),
    ('coach_answer_choisie', 'b@example.org', ${subject}, 'x', 'logged', ${id}, now() at time zone 'utc'),
    ('coach_new_diagnostic', 'a@example.org', ${'Nouvel intérêt ' + id}, 'x', 'logged', ${id}, (now() at time zone 'utc') - interval '20 days'),
    ('candidate_confirmation', 'c@example.org', 'pour elle', 'x', 'logged', ${id}, now() at time zone 'utc')`;
  const mine = (await admin.recentNotices(50)).filter((n) => n.candidate_id === id);
  assert.deepEqual(mine.map((n) => n.subject), [subject], 'one line for two coaches; older than 14 days and candidate emails left out');
  assert.equal(mine[0].name, 'Test');
});

test('A: once she has chosen among the tracks sent they are closed: no edit, no new series; reopening or « none fits » gives the hand back', { skip }, async () => {
  mails.length = 0;
  const { TRACKS_CLOSED_MESSAGE } = await import('../../src/lib/journey.ts');
  const id = await candidate('A');
  await retained(id, 3);
  assert.deepEqual(await P.mayEditTracks(id), { ok: true }, 'nothing sent');
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  assert.deepEqual(await P.mayEditTracks(id), { ok: true }, 'waiting: the exchange lock covers the topic, the tracks themselves are not « closed »');
  let j = await state(id);
  // « none fits »: the coach prepares the next series
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'aucune', null, 'Aucun'), { ok: true });
  assert.deepEqual(await P.mayEditTracks(id), { ok: true });
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true }, 'the second series');
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 1, '', IDEAS), { ok: true });

  // she chose: closed
  assert.deepEqual(await P.mayEditTracks(id), { ok: false, error: TRACKS_CLOSED_MESSAGE });
  assert.deepEqual(await P.sendChoice(id, 1), { ok: false, error: TRACKS_CLOSED_MESSAGE }, 'no third series over her choice');
  assert.equal((await raw`select count(*)::int as n from proposals where candidate_id = ${id} and kind = 'choix'`)[0].n, 2, 'nothing was sent');
  // the subject is not locked by it: the coach goes on from what she chose
  assert.equal(await P.exchangeLock(id), null);

  // reopening gives the hand back (it was refused as « already open » before), and a new series that she chooses from closes it again
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  // timestamps are kept to the second: space the reopening out from the earlier answers and from the next one, as real minutes would
  await raw`update proposals set answered_at = answered_at - interval '2 minutes' where candidate_id = ${id}`;
  await raw`update candidates set reopened_at = reopened_at - interval '1 minute' where id = ${id}`;
  assert.deepEqual(await P.mayEditTracks(id), { ok: true });
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS), { ok: true });
  assert.equal((await P.mayEditTracks(id)).ok, false);
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: true });
  assert.deepEqual(await P.reopenExchanges(id, 'Coach'), { ok: false, error: 'Les échanges sont déjà ouverts.' }, 'open now: nothing to reopen');

  // C and D have no tracks block: even a « choix » answered « choisie » (it cannot happen there) closes nothing
  const c = await candidate('C');
  await raw`insert into proposals (candidate_id, kind, payload, state, response, response_choice, answered_at) values (${c}, 'choix', '{"items":[]}', 'repondue', 'choisie', 0, now() at time zone 'utc')`;
  assert.deepEqual(await P.mayEditTracks(c), { ok: true });
  assert.deepEqual(await P.mayEditTracks(2147483647), { ok: false, error: 'Candidate introuvable' });
});

test('tracksWriteRefusal is the one guard of every write on the tracks: the exchange lock, her choice among those sent, otherwise nothing', { skip }, async () => {
  const { TRACKS_CLOSED_MESSAGE } = await import('../../src/lib/journey.ts');
  const id = await candidate('A');
  await retained(id, 3);
  assert.equal(await P.tracksWriteRefusal(id), null, 'nothing sent');
  await P.sendChoice(id, 1);
  assert.equal(await P.tracksWriteRefusal(id), P.LOCK_MESSAGE.attente, 'waiting for her');
  let j = await state(id);
  await P.answerProposal(id, j.pending.id, 'aucune', null, 'Aucun');
  assert.equal(await P.tracksWriteRefusal(id), null, 'none fits: the next series');
  await P.sendChoice(id, 1);
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS);
  assert.equal(await P.tracksWriteRefusal(id), TRACKS_CLOSED_MESSAGE, 'she chose');
  assert.equal(await P.tracksWriteRefusal(2147483647), 'Candidate introuvable');
});

test('the subject follows her choice (title and format) while the coach has not rewritten it, in a later series too', { skip }, async () => {
  const id = await candidate('A');
  await raw`insert into tracks (candidate_id, title, format, origin, state, pitch, position) values
    (${id}, 'Premier', 'talk', 'ia', 'retenue_coach', 'p1', 0), (${id}, 'Second', 'atelier', 'ia', 'retenue_coach', 'p2', 1)`;
  await P.sendChoice(id, 1);
  let j = await state(id);
  await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS);
  const subject = async () => (await raw`select title, format from subjects where candidate_id = ${id}`)[0];
  assert.deepEqual({ ...(await subject()) }, { title: 'Premier', format: 'talk' }, 'her first choice starts the subject');
  // she changes her mind in a later series: the subject still holds her earlier choice, so it follows
  await P.reopenExchanges(id, 'Coach');
  await P.sendChoice(id, 1);
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'choisie', 1, '', IDEAS);
  assert.deepEqual({ ...(await subject()) }, { title: 'Second', format: 'atelier' }, 'the second choice replaces the first');
  // a title the coach wrote is never replaced
  await raw`update subjects set title = 'Mon titre à moi' where candidate_id = ${id}`;
  await P.reopenExchanges(id, 'Coach');
  await P.sendChoice(id, 1);
  j = await state(id);
  await P.answerProposal(id, j.pending.id, 'choisie', 0, '', IDEAS);
  assert.equal((await subject()).title, 'Mon titre à moi');
});
