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
