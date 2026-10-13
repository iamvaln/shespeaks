// The common calendar against a real Postgres: which events the form offers and who may still apply. Run: npm run test:db
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
let dbName = ''; let data; let diag; let db; let raw;
const urlFor = (d) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${d}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10); // a day relative to the run, so the tests never expire
let ip = 40;
const fresh = () => ({ box: `cal${crypto.randomBytes(4).toString('hex')}`, ip: `198.51.100.${ip++}` });
const profile = (box, city, extra = {}) => ({ P1: 'Awa Test', P2: city, P3: '+237 612 345 678', P4: `${box}@example.org`, P6: 'étudiante', P7: '1-3', ...extra });

before(async () => {
  if (!admin) return;
  dbName = `ss_cal_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url; process.env.SESSION_SECRET = 'test-secret'; delete process.env.RESEND_API_KEY;
  db = await import('../../src/lib/db.ts');
  data = await import('../../src/lib/data.ts');
  diag = await import('../../src/lib/diagnostic.ts');
  raw = postgres(url, { max: 2, onnotice: () => {} });
  await raw`delete from devfest_events`; // only the events of these tests
  await raw`insert into devfest_events (city, name, event_date) values
    ('ouvert', 'Ouvert', ${day(60)}), ('tard', 'Tard', ${day(90)}), ('passe', 'Passé', ${day(-3)}), ('sansdate', 'Sans date', null), ('flou', 'Flou', 'à confirmer')`;
});
after(async () => {
  if (!admin) return;
  await raw?.end(); await db.sql().end();
  await admin.unsafe(`drop database if exists ${dbName} with (force)`); await admin.end();
});

test('the form offers only events with a real day that is still ahead, never « Autre »; the full list stays for display', { skip }, async () => {
  const offered = (await data.getFormRefs()).events.map((e) => e.value);
  assert.deepEqual(offered.sort(), ['ouvert', 'tard']);
  const all = (await data.getRefs()).events.map((e) => e.value);
  for (const v of ['ouvert', 'tard', 'passe', 'sansdate', 'flou', 'autre']) assert.ok(all.includes(v), `${v} is still named elsewhere`);
});

test('with a rehearsal day, an event on or before it is no longer offered; an unreadable day is ignored', { skip }, async () => {
  await db.setSetting('rehearsal_date', day(70));
  assert.deepEqual((await data.getFormRefs()).events.map((e) => e.value), ['tard']);
  await db.setSetting('rehearsal_date', day(60));
  assert.deepEqual((await data.getFormRefs()).events.map((e) => e.value), ['tard'], 'the rehearsal day itself is not an event day');
  await db.setSetting('rehearsal_date', 'bientôt');
  assert.deepEqual((await data.getFormRefs()).events.map((e) => e.value).sort(), ['ouvert', 'tard']);
  await db.setSetting('rehearsal_date', '');
});

test('a new candidate can start only on an offered event', { skip }, async () => {
  for (const [city, why] of [['autre', 'Autre'], ['sansdate', 'no date'], ['flou', 'unreadable date'], ['passe', 'past'], ['inconnu', 'unknown']]) {
    const { box, ip } = fresh();
    const r = await diag.submitScreen(null, 'profile', profile(box, city, city === 'autre' ? { P2o: 'DevFest Test' } : {}), 'fr', ip);
    assert.equal(r.ok, false, why);
    assert.ok(r.errors?.P2, `${why}: the event answer is refused`);
  }
  const { box, ip } = fresh();
  const ok = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(ok.ok, true, JSON.stringify(ok));
});

test('the wizard state offers the same events, and the coach space still names the event of an existing dossier', { skip }, async () => {
  const [old] = await raw`insert into candidates (token, name, email, city, city_other, branch, status) values ('t-old', 'Ancienne', 'old@example.org', 'autre', 'DevFest Kribi', 'A', 'en_cours') returning id`;
  const c = await data.getCandidate(old.id);
  assert.deepEqual((await diag.wizardState(c)).refs.events.map((e) => e.value).sort(), ['ouvert', 'tard']);
  assert.equal(await data.eventLabelFor(c), 'DevFest Kribi');
  const [other] = await raw`insert into candidates (token, name, email, city, branch, status) values ('t-pass', 'Passée', 'pass@example.org', 'passe', 'A', 'en_cours') returning id`;
  assert.equal(await data.eventLabelFor(await data.getCandidate(other.id)), 'Passé');
});

const reset = async () => { await db.setSetting('interest_deadline', ''); await db.setSetting('rehearsal_date', ''); };

test('after the last day to send an interest nobody starts or goes on, unless the team admitted her; the deadline day itself is open', { skip }, async () => {
  await reset();
  const { box, ip } = fresh();
  const started = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(started.ok, true, JSON.stringify(started));
  const token = started.token;
  const before = (await raw`select count(*)::int as n from candidates`)[0].n;

  await db.setSetting('interest_deadline', day(0));
  assert.equal((await diag.submitScreen(token, 'diag1', { D1: 'premiere', D2: 2, D3: ['trac'] }, 'fr')).ok, true, 'the deadline day is still open');
  const second = fresh();
  assert.equal((await diag.submitScreen(null, 'profile', profile(second.box, 'ouvert'), 'fr', second.ip)).ok, true, 'a new one too');

  await db.setSetting('interest_deadline', day(-1));
  const late = fresh();
  assert.deepEqual(await diag.submitScreen(null, 'profile', profile(late.box, 'ouvert'), 'fr', late.ip), { ok: false, errors: {}, fatal: 'closed', closedOn: day(-1) });
  assert.equal((await raw`select count(*)::int as n from candidates`)[0].n, before + 1, 'no dossier is created once closed');
  assert.deepEqual(await diag.submitScreen(token, 'diag2', { D4: 'atelier', P5: 'fr', D5: '1-2', D6: 'A' }, 'fr'), { ok: false, errors: {}, fatal: 'closed', closedOn: day(-1) }, 'an unfinished form is closed too');

  await raw`update candidates set admitted_late_at = now() at time zone 'utc' where token = ${token}`;
  assert.equal((await diag.submitScreen(token, 'diag2', { D4: 'atelier', P5: 'fr', D5: '1-2', D6: 'A' }, 'fr')).ok, true, 'admitted: she goes on');
  assert.equal((await diag.submitScreen(null, 'profile', profile(late.box, 'ouvert'), 'fr', late.ip)).fatal, 'closed', 'admission is for her only');

  await db.setSetting('interest_deadline', 'bientôt');
  assert.equal((await diag.submitScreen(null, 'profile', profile(late.box, 'ouvert'), 'fr', late.ip)).ok, true, 'an unreadable date closes nothing');
  await reset();
});

test('with no event on offer a new candidate cannot start, one who has started goes on', { skip }, async () => {
  await reset();
  const { box, ip } = fresh();
  const started = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(started.ok, true);
  await db.setSetting('rehearsal_date', day(200)); // after every event: none is offered
  const other = fresh();
  assert.deepEqual(await diag.submitScreen(null, 'profile', profile(other.box, 'ouvert'), 'fr', other.ip), { ok: false, errors: {}, fatal: 'closed', closedOn: null });
  assert.equal((await diag.submitScreen(started.token, 'diag1', { D1: 'premiere', D2: 2, D3: ['trac'] }, 'fr')).ok, true);
  assert.deepEqual(await (await import('../../src/lib/admission.ts')).admission(null), { open: false, closedOn: null });
  await reset();
});

test('reminders to finish the form stop once it is closed, unless she was admitted', { skip }, async () => {
  await reset();
  const reminders = await import('../../src/lib/reminders.ts');
  await db.setSetting('reminders_enabled', 'true');
  const mk = async (name, extra = '') => {
    const [r] = await raw`insert into candidates (token, name, email, city, branch, status, last_activity_at, admitted_late_at)
      values (${crypto.randomBytes(6).toString('hex')}, ${name}, ${name.toLowerCase() + crypto.randomBytes(3).toString('hex') + '@example.org'}, 'ouvert', 'A', 'en_cours', (now() at time zone 'utc') - interval '3 days', ${extra ? new Date() : null}) returning id`;
    return r.id;
  };
  const plain = await mk('Plain');
  const admitted = await mk('Admitted', 'late');
  let report = await reminders.runReminders(new Date());
  assert.ok(report.due.some((d) => d.id === plain) && report.due.some((d) => d.id === admitted), 'open: both are reminded');

  await raw`update candidates set reminders_sent = 0, last_reminder_at = null where id in (${plain}, ${admitted})`;
  await db.setSetting('interest_deadline', day(-1));
  report = await reminders.runReminders(new Date());
  assert.ok(!report.due.some((d) => d.id === plain), 'closed: she is not urged to finish');
  assert.ok(report.due.some((d) => d.id === admitted), 'admitted: she still is');
  assert.equal((await raw`select reminders_sent from candidates where id=${plain}`)[0].reminders_sent, 0, 'and nothing is claimed for her, so an admission later works');
  assert.equal(await reminders.sendReminderNow(plain), 'closed');
  assert.notEqual(await reminders.sendReminderNow(admitted), 'closed');
  await reset();
});

// ---- finishing the form ----------------------------------------------------------------------------------------------------------
const DIAG1 = { D1: 'premiere', D2: 2, D3: ['legitime', 'trac'] };
const DIAG2 = { D4: 'atelier', P5: 'fr', D5: '1-2', D6: 'B' };
async function walkToLastScreen() {
  const { box, ip } = fresh();
  const first = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(first.ok, true, JSON.stringify(first));
  for (const [screen, values] of [['diag1', DIAG1], ['diag2', DIAG2], ['b1', { B1: 'web', B3: 'tous' }]]) assert.equal((await diag.submitScreen(first.token, screen, values, 'fr')).ok, true, screen);
  const [row] = await raw`select id from candidates where token = ${first.token}`;
  return { token: first.token, id: row.id };
}
const waitFor = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('the last screen finishes the form in one transaction: when finishing fails nothing is half done, and she can send it again', { skip }, async () => {
  await reset();
  const { token, id } = await walkToLastScreen();
  await raw`create or replace function ss_fail_subject() returns trigger language plpgsql as $$ begin raise exception 'finishing failed on purpose'; end $$`;
  await raw`create trigger ss_fail_subject before insert on subjects for each row execute function ss_fail_subject()`;
  try {
    await assert.rejects(() => diag.submitScreen(token, 'b2', { B4: ['retour'] }, 'fr'), /finishing failed on purpose/);
  } finally {
    await raw`drop trigger if exists ss_fail_subject on subjects`;
  }
  const [stuck] = await raw`select current_screen, completed_at, status from candidates where id = ${id}`;
  assert.deepEqual({ ...stuck }, { current_screen: 'b2', completed_at: null, status: 'en_cours' }, 'not « done » without its end date, not half finished');
  assert.equal((await raw`select count(*)::int as n from answers where candidate_id = ${id} and code = 'B4'`)[0].n, 0, 'the last answers were not kept either: she sends the page again');

  const again = await diag.submitScreen(token, 'b2', { B4: ['retour'] }, 'fr');
  assert.deepEqual([again.ok, again.completed, again.next], [true, true, 'done']);
  const [done] = await raw`select current_screen, completed_at, status from candidates where id = ${id}`;
  assert.equal(done.current_screen, 'done'); assert.ok(done.completed_at); assert.equal(done.status, 'diagnostic_recu');
  assert.equal((await raw`select count(*)::int as n from subjects where candidate_id = ${id}`)[0].n, 1);
  assert.ok(await waitFor(async () => (await raw`select count(*)::int as n from email_log where candidate_id = ${id}`)[0].n >= 1), 'the confirmation goes out after the commit');
});

test('two simultaneous sends of the last screen finish the form once', { skip }, async () => {
  await reset();
  const { token, id } = await walkToLastScreen();
  const both = await Promise.all([diag.submitScreen(token, 'b2', { B4: ['retour'] }, 'fr'), diag.submitScreen(token, 'b2', { B4: ['retour'] }, 'fr')]);
  assert.ok(both.every((r) => r.ok), JSON.stringify(both));
  assert.equal((await raw`select count(*)::int as n from status_history where candidate_id = ${id} and new_status = 'diagnostic_recu'`)[0].n, 1, 'one status change');
  assert.equal((await raw`select count(*)::int as n from subjects where candidate_id = ${id}`)[0].n, 1);
});

test('a dossier left « done » without an end date is finished when it is opened, dated from her last send, even after the closing day', { skip }, async () => {
  await reset();
  const [row] = await raw`insert into candidates (token, name, email, city, branch, status, current_screen, last_activity_at)
    values ('t-stuck', 'Bloquée', 'stuck@example.org', 'ouvert', 'B', 'en_cours', 'done', '2026-09-30 22:30:00') returning id`;
  await db.setSetting('interest_deadline', day(-10)); // closed for everyone else
  const c = await data.getCandidate(row.id);
  assert.equal(diag.isStuck(c), true);
  const healed = await diag.healStuck(c);
  assert.ok(healed.completed_at, 'finished');
  assert.equal(healed.completed_at.slice(0, 19).replace('T', ' '), '2026-09-30 22:30:00', 'dated from her last send, not from the recovery');
  assert.equal(healed.status, 'diagnostic_recu');
  assert.equal((await raw`select count(*)::int as n from subjects where candidate_id = ${row.id}`)[0].n, 1);
  assert.equal(diag.isStuck(healed), false);
  assert.equal(await diag.healStuck(healed), healed, 'nothing to do the second time');
  const quiet = await data.getCandidate((await raw`insert into candidates (token, name, branch, status, current_screen) values ('t-mid', 'Milieu', 'B', 'en_cours', 'b2') returning id`)[0].id);
  assert.equal((await diag.healStuck(quiet)).completed_at, null, 'a dossier still being filled is left alone');
  await reset();
});
