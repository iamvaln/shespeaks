// The proposals flow against a real Postgres. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import postgres from 'postgres';
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
  process.env.DATABASE_URL = url; process.env.SESSION_SECRET = 'test-secret';
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
  await P.sendSubject(id2, 1); // replaces it
  assert.deepEqual(await P.answerProposal(id2, old, 'approuvee', null, ''), { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' });
  assert.equal((await raw`select state from proposals where id = ${old}`)[0].state, 'remplacee');
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
