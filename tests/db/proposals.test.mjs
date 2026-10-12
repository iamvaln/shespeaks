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

test('A: choice sent (frozen copy), chosen, subject sent, changes asked, sent again, approved, photo, submission', { skip }, async () => {
  mails.length = 0;
  const id = await candidate('A');
  await retained(id, 3);
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  await raw`update tracks set title = 'Modifié après envoi' where candidate_id = ${id}`;
  let j = await state(id);
  assert.equal(j.waiting, 'candidate');
  assert.equal(j.pending.payload.items[0].title, 'Sujet 0', 'frozen copy');
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 1, 'Celui-ci !'), { ok: true });
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
  assert.deepEqual(await P.answerProposal(other, (await state(id)).pending.id, 'choisie', 0, ''), { ok: false, error: 'Proposition introuvable.' });
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
  await raw`update candidates set status = 'sujet_valide' where id = ${id}`; // out of the « intérêt reçu » count
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
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
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 0, ''), { ok: true });
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.pending.kind], ['sujet', 'sujet']);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, 'Pas tout à fait'), { ok: true });
  // the coach goes back to a choice of topics: that choice is what /plan shows
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
  await P.answerProposal(id, (await state(id)).pending.id, 'choisie', 1, '');
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
  await P.answerProposal(id, j.pending.id, 'choisie', 1, '');
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  const cd = await candidate('C');
  await subjectFor(cd);
  assert.deepEqual(await P.sendSubject(cd, 1), { ok: true }, 'C and D send their subject directly');
});
