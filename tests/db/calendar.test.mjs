// The common calendar against a real Postgres: which events the form offers and who may still apply. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import postgres from 'postgres';
import './next-stub.mjs';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';
import { addDays, todayIso } from '../../src/lib/dates.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
let dbName = ''; let data; let diag; let db; let raw; let cal; let reminders;
const urlFor = (d) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${d}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };
const day = (n) => addDays(todayIso(), n); // a day relative to the run, in the programme's zone like the code under test (never the UTC date: they differ for an hour a day)
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
  cal = await import('../../src/lib/calendar-reminders.ts');
  reminders = await import('../../src/lib/reminders.ts');
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
  assert.deepEqual((await diag.wizardState(c)).refs.events.map((e) => e.value).sort(), ['autre', 'ouvert', 'tard'], 'her own event stays in her list, so the choice she made is still shown');
  assert.deepEqual((await diag.wizardState({ ...c, city: null })).refs.events.map((e) => e.value).sort(), ['ouvert', 'tard']);
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

// ---- the calendar reminders ----------------------------------------------------------------------------------------------------
const at = (n) => new Date(Date.parse(`${day(n)}T09:00:00Z`)); // 10:00 in Douala on that day (relative to the run)
const logged = async (id, kind) => (await raw`select count(*)::int as n from email_log where candidate_id = ${id} and kind = ${kind}`)[0].n;
const journal = async (id) => (await raw`select key from calendar_reminders where candidate_id = ${id} order by key`).map((r) => r.key);
let seq = 0;
async function stalled(extra = {}) {
  const n = ++seq;
  const [r] = await raw`insert into candidates (token, name, email, city, branch, status, current_screen, locale)
    values (${'cal-s' + n + crypto.randomBytes(3).toString('hex')}, ${'Etape' + n}, ${`step${n}${crypto.randomBytes(3).toString('hex')}@example.org`}, 'ouvert', 'A', 'en_cours', 'a2', 'fr') returning id`;
  return r.id;
}
async function finished(step, extra = {}) {
  const n = ++seq;
  const [r] = await raw`insert into candidates (token, name, email, city, branch, status, current_screen, completed_at, locale, photo_validated_at)
    values (${'cal-f' + n + crypto.randomBytes(3).toString('hex')}, ${'Finie' + n}, ${`fin${n}${crypto.randomBytes(3).toString('hex')}@example.org`}, 'ouvert', 'D', 'diagnostic_recu', 'done', now() at time zone 'utc', 'fr', ${step === 'soumission' || step === 'photo' ? new Date() : null}) returning id`;
  // branch D starts at the subject: one sent to her and waiting, or approved
  if (step === 'sujet') await raw`insert into proposals (candidate_id, kind, payload, state) values (${r.id}, 'sujet', '{}', 'envoyee')`;
  if (step === 'soumission') await raw`insert into proposals (candidate_id, kind, payload, state, response, answered_at) values (${r.id}, 'sujet', '{}', 'repondue', 'approuvee', now() at time zone 'utc')`;
  return r.id;
}
const clean = async () => { await raw`delete from calendar_reminders`; await raw`delete from email_log`; await raw`delete from proposals`; await raw`delete from candidates`; await reset(); await db.setSetting('internal_deadline', ''); await db.setSetting('calendar_reminders_enabled', 'true'); await db.setSetting('reminders_enabled', 'true'); };

test('closing of the form: 3 days and 1 day before, once each, only when the switch is on; the preview needs no switch and writes nothing', { skip }, async () => {
  await clean();
  const id = await stalled();
  const gone = await stalled(); await raw`update candidates set email = null where id = ${gone}`;
  await db.setSetting('interest_deadline', day(3));
  await db.setSetting('calendar_reminders_enabled', 'false');
  assert.deepEqual((await cal.runCalendarReminders(at(0))).due, [], 'switch off: a real run does nothing');
  const preview = await cal.runCalendarReminders(at(0), { dry: true });
  assert.deepEqual(preview.due.map((d) => [d.id, d.kind, d.tier, d.daysLeft]), [[id, 'closing', 3, 3]], 'the preview lists her, not the one without an address');
  assert.equal(preview.enabled, false);
  assert.deepEqual(await journal(id), [], 'nothing written by a preview');
  await db.setSetting('calendar_reminders_enabled', 'true');

  assert.equal((await cal.runCalendarReminders(at(-1))).sent, 0, '4 days before: too early');
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 1);
  assert.deepEqual(await journal(id), [`closing:${day(3)}:3`]);
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 0, 'the same run again: nothing');
  assert.equal(await logged(id, 'calendar_closing'), 1);
  assert.match((await raw`select body_text from email_log where candidate_id = ${id}`)[0].body_text, /Plus que 3 jours|trois jours|3 jours/);
  assert.equal((await cal.runCalendarReminders(at(1))).sent, 0, 'the second day of the window: already written');
  assert.equal((await cal.runCalendarReminders(at(2))).sent, 1, '1 day before: the second reminder');
  assert.equal((await cal.runCalendarReminders(at(3))).sent, 0, 'the deadline day: already written (tier 1 spans it)');
  assert.equal((await cal.runCalendarReminders(at(4))).sent, 0, 'never after the deadline');
  assert.deepEqual(await journal(id), [`closing:${day(3)}:1`, `closing:${day(3)}:3`]);
});

test('a missed day is made up the day after, never later; a failed send gives the reminder back; a new date arms it again', { skip }, async () => {
  await clean();
  const id = await stalled();
  await db.setSetting('interest_deadline', day(3));
  assert.equal((await cal.runCalendarReminders(at(1))).sent, 1, 'the cron missed the day it fell on: sent the day after');
  await raw`delete from calendar_reminders`; await raw`delete from email_log`;
  assert.equal((await cal.runCalendarReminders(at(-3))).sent, 0, 'too early');
  await raw`insert into calendar_reminders (candidate_id, key) values (${id}, ${`closing:${day(3)}:1`})`; // tier 1 already written: at(2) is past tier 3's two days, and only tier 3 could still be sent
  assert.equal((await cal.runCalendarReminders(at(2))).sent, 0, 'one day after the window of tier 3: it is gone for good');
  await raw`delete from calendar_reminders`;

  // a send that fails (Resend unreachable) leaves no trace in the journal
  await raw`delete from calendar_reminders`;
  const saved = { key: process.env.RESEND_API_KEY, url: process.env.RESEND_API_URL, gap: process.env.RESEND_MIN_GAP_MS };
  process.env.RESEND_API_KEY = 'x'; process.env.RESEND_API_URL = 'http://127.0.0.1:9'; process.env.RESEND_MIN_GAP_MS = '0';
  let failed;
  try { failed = await cal.runCalendarReminders(at(0)); } finally { process.env.RESEND_API_KEY = saved.key ?? ''; if (!saved.key) delete process.env.RESEND_API_KEY; if (saved.url) process.env.RESEND_API_URL = saved.url; else delete process.env.RESEND_API_URL; if (saved.gap) process.env.RESEND_MIN_GAP_MS = saved.gap; else delete process.env.RESEND_MIN_GAP_MS; }
  assert.deepEqual([failed.sent, failed.failed], [0, 1]);
  assert.deepEqual(await journal(id), [], 'given back, so the next run tries again');
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 1, 'the next run sends it');

  // the team moves the date: the reminder is armed again for the new date
  await db.setSetting('interest_deadline', day(4));
  assert.equal((await cal.runCalendarReminders(at(1))).sent, 1, 'new date, new key');
  assert.deepEqual(await journal(id), [`closing:${day(3)}:3`, `closing:${day(4)}:3`]);
});

test('exchanges: only when it is her turn, 7, 3 and 1 days before the internal date; a reopened journey keeps them', { skip }, async () => {
  await clean();
  await db.setSetting('internal_deadline', day(7));
  const waiting = await finished('sujet');
  const coachTurn = await finished('sujet'); await raw`delete from proposals where candidate_id = ${coachTurn}`; // nothing sent to her
  const reopened = await finished('sujet'); await raw`update candidates set reopened_at = now() at time zone 'utc' where id = ${reopened}`;
  const out = await finished('sujet'); await raw`update candidates set status = 'non_retenue' where id = ${out}`;
  const submitted = await finished('sujet'); await raw`update candidates set submitted_at = now() at time zone 'utc' where id = ${submitted}`;
  const r = await cal.runCalendarReminders(at(0));
  assert.deepEqual(r.due.map((d) => d.id).sort(), [reopened, waiting].sort(), 'her turn only; not set aside, not submitted');
  assert.equal(r.sent, 2);
  assert.equal(await logged(waiting, 'calendar_exchange'), 1);
  assert.deepEqual(await journal(waiting), [`exchange:${day(7)}:7`]);
  assert.equal((await cal.runCalendarReminders(at(4))).sent, 2, '3 days before');
  assert.equal((await cal.runCalendarReminders(at(6))).sent, 2, '1 day before');
});

test('submission: aims at the first date ahead, and a missed day sends only the closest tier', { skip }, async () => {
  await clean();
  await raw`update devfest_events set cfp_close_date = ${day(12)} where city = 'ouvert'`;
  await db.setSetting('internal_deadline', day(5));
  const id = await finished('soumission');
  let r = await cal.runCalendarReminders(at(-2));
  assert.deepEqual(r.due.map((d) => [d.kind, d.target, d.tier]), [['submit', day(5), 7]], 'internal date first');
  await clean(); await db.setSetting('internal_deadline', day(5));
  const again = await finished('soumission');
  r = await cal.runCalendarReminders(at(5)); // the cron missed the day before: « 1 day left » and « last day » are both due
  assert.deepEqual(r.due.map((d) => [d.id, d.tier]), [[again, 0]], 'the closest tier is sent');
  assert.deepEqual(await journal(again), [`submit:${day(5)}:0`, `submit:${day(5)}:1`], 'the other is written, not sent');
  assert.equal(await logged(again, 'calendar_submit'), 1);
  // the internal date has passed: the next date ahead is the call's own closing
  await clean(); await db.setSetting('internal_deadline', day(1));
  const later = await finished('soumission');
  r = await cal.runCalendarReminders(at(6));
  assert.deepEqual(r.due.map((d) => [d.id, d.kind, d.target, d.tier]), [[later, 'submit', day(12), 7]], 'second date: its own reminders');
});

test('one email per candidate and day: the other passes wait, nothing is claimed; one per mailbox', { skip }, async () => {
  await clean();
  await db.setSetting('interest_deadline', day(3));
  const id = await stalled();
  await raw`update candidates set last_activity_at = (now() at time zone 'utc') - interval '3 days' where id = ${id}`; // the abandoned-form pass would also write to her
  const now = new Date();
  const first = await cal.runCalendarReminders(now);
  assert.equal(first.sent, 1);
  const other = await reminders.runReminders(now);
  assert.ok(!other.due.some((d) => d.id === id), 'the abandoned-form pass skips her today');
  assert.equal((await raw`select reminders_sent from candidates where id = ${id}`)[0].reminders_sent, 0, 'and her tier is not burned');
  assert.equal(await logged(id, 'candidate_reminder_1'), 0);

  // the 48 h proposal reminder waits too
  const waiting = await finished('sujet');
  await raw`update proposals set sent_at = (now() at time zone 'utc') - interval '3 days' where candidate_id = ${waiting}`;
  await raw`insert into calendar_reminders (candidate_id, key) values (${waiting}, 'closing:old:3')`; // written to today
  assert.equal(await reminders.remindPendingProposals(now), 0);
  assert.equal((await raw`select reminded_at from proposals where candidate_id = ${waiting}`)[0].reminded_at, null, 'its one reminder is still to come');

  // two dossiers on one mailbox: one per run
  await clean();
  await db.setSetting('interest_deadline', day(3));
  const a = await stalled(); const b = await stalled();
  await raw`update candidates set email = 'shared@example.org' where id in (${a}, ${b})`;
  const r = await cal.runCalendarReminders(at(0));
  assert.equal(r.sent, 1);
  assert.equal(r.due.filter((d) => d.held).length, 1, 'the other is held, and listed with the reason');
  assert.match(r.due.find((d) => d.held).held, /même boîte/);
  assert.equal((await cal.runCalendarReminders(at(1))).sent, 1, 'the other dossier goes the next day, still inside the two-day window');
  assert.equal((await cal.runCalendarReminders(at(1))).sent, 0, 'and only once');
  assert.deepEqual([await journal(a), await journal(b)].map((k) => k.length), [1, 1]);
});

// ---- what the review of this delivery found ----------------------------------------------------------------------------------------
async function withBrokenResend(fn) {
  const saved = { key: process.env.RESEND_API_KEY, url: process.env.RESEND_API_URL, gap: process.env.RESEND_MIN_GAP_MS };
  process.env.RESEND_API_KEY = 'x'; process.env.RESEND_API_URL = 'http://127.0.0.1:9'; process.env.RESEND_MIN_GAP_MS = '0'; // nothing listens there: every send fails
  try { return await fn(); } finally {
    for (const [env, v] of [['RESEND_API_KEY', saved.key], ['RESEND_API_URL', saved.url], ['RESEND_MIN_GAP_MS', saved.gap]]) { if (v === undefined) delete process.env[env]; else process.env[env] = v; }
  }
}
const stuckCandidate = async (status, branch = 'B') => (await raw`insert into candidates (token, name, email, city, branch, status, current_screen, last_activity_at, coach_id)
  values (${'t-st' + crypto.randomBytes(5).toString('hex')}, 'Bloquée', ${`st${crypto.randomBytes(4).toString('hex')}@example.org`}, 'ouvert', ${branch}, ${status}, 'done', '2026-09-30 22:30:00', null) returning id`)[0].id;

test('recovering a dossier the team already set aside finishes it but leaves its status alone and sends nothing; a failing recovery never throws', { skip }, async () => {
  await clean();
  const aside = await stuckCandidate('non_retenue');
  const healed = await diag.healStuck(await data.getCandidate(aside));
  assert.ok(healed.completed_at, 'finished: she is no longer sent back to screen 1');
  assert.equal(healed.status, 'non_retenue', 'the status the team set is kept');
  assert.equal((await raw`select count(*)::int as n from status_history where candidate_id = ${aside} and new_status = 'diagnostic_recu'`)[0].n, 0);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await raw`select count(*)::int as n from email_log where candidate_id = ${aside}`)[0].n, 0, 'no confirmation to her, no notification to the coaches');

  const plain = await stuckCandidate('en_cours');
  await raw`create or replace function ss_fail_subject() returns trigger language plpgsql as $$ begin raise exception 'recovery failed on purpose'; end $$`;
  await raw`create trigger ss_fail_subject before insert on subjects for each row execute function ss_fail_subject()`;
  let again;
  try { again = await diag.healStuck(await data.getCandidate(plain)); } finally { await raw`drop trigger if exists ss_fail_subject on subjects`; }
  assert.equal(again.completed_at, null, 'not finished, and no exception: the page, the link and the code keep working');
  assert.ok((await diag.healStuck(await data.getCandidate(plain))).completed_at, 'the next opening finishes it');
  assert.equal((await data.getCandidate(plain)).status, 'diagnostic_recu');
});

test('a dossier keeps the event she chose when she saves her profile again, even one no longer offered or « Autre »; she cannot move to a closed one', { skip }, async () => {
  await reset();
  const { box, ip } = fresh();
  const first = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(first.ok, true);
  await db.setSetting('rehearsal_date', day(70)); // 'ouvert' (day 60) is no longer offered to new candidates
  assert.equal((await diag.submitScreen(first.token, 'profile', profile(box, 'ouvert', { P1: 'Awa Corrigé' }), 'fr', ip)).ok, true, 'her own event is kept');
  const moved = await diag.submitScreen(first.token, 'profile', profile(box, 'passe'), 'fr', ip);
  assert.ok(moved.errors?.P2, 'but she cannot pick another closed event');
  await reset();
  const old = fresh();
  await raw`insert into candidates (token, name, email, city, city_other, branch, status, current_screen) values (${'t-old' + old.box}, 'Ancienne', ${`${old.box}@example.org`}, 'autre', 'DevFest Kribi', 'A', 'en_cours', 'a1')`;
  const re = await diag.submitScreen('t-old' + old.box, 'profile', profile(old.box, 'autre', { P2o: 'DevFest Kribi' }), 'fr', old.ip);
  assert.equal(re.ok, true, JSON.stringify(re));
  assert.equal((await raw`select city, city_other from candidates where token = ${'t-old' + old.box}`)[0].city, 'autre');
});

test('the reminders follow her own event: nothing once it is over or her call has closed, a past closing date is never quoted, « Autre » is matched by name', { skip }, async () => {
  await clean();
  const { fmtDate } = await import('../../src/lib/i18n.ts');
  await raw`update devfest_events set cfp_close_date = ${day(12)} where city = 'ouvert'`;
  await raw`update devfest_events set cfp_close_date = ${day(-20)} where city = 'passe'`;
  await raw`update devfest_events set cfp_close_date = ${day(-1)} where city = 'tard'`; // the event is ahead, its call has closed
  await db.setSetting('internal_deadline', day(3));
  const live = await finished('soumission');
  const over = await finished('soumission'); await raw`update candidates set city = 'passe' where id = ${over}`;
  const closedCall = await finished('soumission'); await raw`update candidates set city = 'tard' where id = ${closedCall}`;
  const closedCallSujet = await finished('sujet'); await raw`update candidates set city = 'tard' where id = ${closedCallSujet}`;
  await raw`insert into devfest_events (city, name, event_date, cfp_close_date) values ('fini', 'Fini', ${day(-1)}, ${day(10)})`; // the event is over although its call date has not passed
  const overOnly = await finished('soumission'); await raw`update candidates set city = 'fini' where id = ${overOnly}`;
  const named = await finished('soumission'); await raw`update candidates set city = 'autre', city_other = 'Ouvert' where id = ${named}`;
  const r = await cal.runCalendarReminders(at(0), { dry: true });
  assert.deepEqual(r.due.map((d) => d.id).sort(), [live, named].sort(), 'not those whose event is over, nor those whose call has closed');
  assert.ok(overOnly > 0 && over > 0);
  await cal.runCalendarReminders(at(0));
  const body = (await raw`select body_text from email_log where candidate_id = ${live}`)[0].body_text;
  assert.ok(body.includes(fmtDate(day(3), 'fr')) && body.includes(fmtDate(day(12), 'fr')), 'the internal date, then the call\'s closing, which is still ahead');
  await raw`delete from devfest_events where city = 'fini'`;
  // the call closes before the internal date: that closing is the date she is reminded of, with no « internal » wording
  await clean(); await db.setSetting('internal_deadline', day(6)); await raw`update devfest_events set cfp_close_date = ${day(3)} where city = 'ouvert'`;
  const early = await finished('soumission');
  await cal.runCalendarReminders(at(0));
  const text = (await raw`select body_text from email_log where candidate_id = ${early}`)[0].body_text;
  assert.ok(text.includes(fmtDate(day(3), 'fr')) && !text.includes(fmtDate(day(6), 'fr')), 'the call\'s own closing');
});

test('one email per candidate and day across every pass and one per mailbox across runs; dossiers on one mailbox take turns', { skip }, async () => {
  await clean();
  await db.setSetting('interest_deadline', day(3));
  const a = await stalled(); const b = await stalled();
  await raw`update candidates set email = 'shared@example.org' where id in (${a}, ${b})`;
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 1);
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 0, 'a second run the same day does not write to the other dossier of the mailbox');

  // written to today by the abandoned-form pass, or by the 48 h proposal reminder: the calendar pass leaves her until tomorrow
  await clean(); await db.setSetting('interest_deadline', day(3));
  const x = await stalled(); await raw`update candidates set reminders_sent = 1, last_reminder_at = now() at time zone 'utc' where id = ${x}`;
  const y = await finished('sujet'); await db.setSetting('internal_deadline', day(3)); await raw`update proposals set reminded_at = now() at time zone 'utc' where candidate_id = ${y}`;
  const held = (await cal.runCalendarReminders(at(0), { dry: true })).due;
  assert.deepEqual(held.map((d) => [d.id, d.held]).sort(), [[x, 'déjà prévenue aujourd’hui'], [y, 'déjà prévenue aujourd’hui']].sort());

  // turns: the one who waited longest goes first when the dates are equal
  await clean(); await db.setSetting('internal_deadline', day(2));
  const p = await finished('soumission'); const q = await finished('soumission');
  await raw`update candidates set email = 'turns@example.org' where id in (${p}, ${q})`;
  await cal.runCalendarReminders(at(0));    // tier 3: the lower id first
  await cal.runCalendarReminders(at(1));    // tier 1: the other one, who waited longest
  await cal.runCalendarReminders(at(2));    // last day: back to the first
  assert.deepEqual([await logged(p, 'calendar_submit'), await logged(q, 'calendar_submit')], [2, 1], 'both are served, none is starved');
});

test('a failed send gives back the tiers it replaced; two simultaneous runs send once; the cap holds; a stuck dossier is not urged to finish', { skip }, async () => {
  await clean();
  await db.setSetting('internal_deadline', day(0));
  const id = await finished('soumission');
  const failed = await withBrokenResend(() => cal.runCalendarReminders(at(0))); // last day: tier 0 replaces tier 1
  assert.deepEqual([failed.sent, failed.failed], [0, 1]);
  assert.deepEqual(await journal(id), [], 'neither tier stays written: she is not counted as written to');
  assert.equal((await cal.runCalendarReminders(at(0))).sent, 1, 'the next run sends it');
  assert.deepEqual(await journal(id), [`submit:${day(0)}:0`, `submit:${day(0)}:1`]);

  await clean(); await db.setSetting('interest_deadline', day(3));
  const one = await stalled();
  const both = await Promise.all([cal.runCalendarReminders(at(0)), cal.runCalendarReminders(at(0))]);
  assert.equal(both.reduce((n, r) => n + r.sent, 0), 1, 'the journal row is the lock: one send in all');
  assert.equal(await logged(one, 'calendar_closing'), 1);

  await clean(); await db.setSetting('interest_deadline', day(3));
  await stalled(); await stalled(); await stalled();
  const capped = await cal.runCalendarReminders(at(0), { max: 2 });
  assert.equal(capped.sent, 2);
  assert.match(capped.due.find((d) => d.held).held, /plafond de 2/);

  await clean(); await db.setSetting('interest_deadline', day(3));
  const fin = await stalled(); await raw`update candidates set current_screen = 'done' where id = ${fin}`;
  assert.deepEqual((await cal.runCalendarReminders(at(0), { dry: true })).due, [], 'her last page was sent: she is finished, not to be urged');
});

test('« written to today » follows the programme day: a row at 22:59 UTC the day before is not today, one at 23:01 is', { skip }, async () => {
  await clean();
  const journalMod = await import('../../src/lib/calendar-journal.ts');
  const { dayStartUtc } = await import('../../src/lib/dates.ts');
  const id = await stalled();
  const start = Date.parse(`${dayStartUtc(day(0)).replace(' ', 'T')}Z`);
  const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  await raw`insert into calendar_reminders (candidate_id, key, sent_at) values (${id}, 'closing:a:3', ${stamp(start - 60_000)})`;
  assert.equal((await journalMod.mailedToday(day(0))).ids.has(id), false, 'one minute before the day began');
  await raw`insert into calendar_reminders (candidate_id, key, sent_at) values (${id}, 'closing:a:1', ${stamp(start + 60_000)})`;
  assert.equal((await journalMod.mailedToday(day(0))).ids.has(id), true, 'one minute after');
});

test('a week before her event\'s call for speakers closes, the event leaves the form and a started form closes, unless the team admitted her', { skip }, async () => {
  await reset();
  await raw`update devfest_events set cfp_close_date = null where city = 'ouvert'`; // the reminder tests above leave a call date on it
  const { box, ip } = fresh();
  const started = await diag.submitScreen(null, 'profile', profile(box, 'ouvert'), 'fr', ip);
  assert.equal(started.ok, true, JSON.stringify(started));
  const { admission } = await import('../../src/lib/admission.ts');
  const her = async () => (await raw`select * from candidates where token = ${started.token}`)[0];
  assert.deepEqual(await admission(await her()), { open: true });
  await raw`update devfest_events set cfp_close_date = ${day(6)} where city = 'ouvert'`; // its last day was yesterday
  assert.ok(!(await data.getFormRefs()).events.some((e) => e.value === 'ouvert'), 'no longer offered to a new candidate');
  assert.deepEqual(await admission(await her()), { open: false, closedOn: day(-1) });
  assert.equal((await diag.submitScreen(started.token, 'diag1', { D1: 'premiere', D2: 2, D3: ['trac'] }, 'fr')).fatal, 'closed');
  await raw`update candidates set admitted_late_at = now() at time zone 'utc' where token = ${started.token}`;
  assert.deepEqual(await admission(await her()), { open: true }, 'admitted by the team');
  await raw`update devfest_events set cfp_close_date = ${day(7)} where city = 'ouvert'`;
  assert.ok((await data.getFormRefs()).events.some((e) => e.value === 'ouvert'), 'the last day itself is open');
  await raw`update devfest_events set cfp_close_date = null where city = 'ouvert'`;
  await reset();
});
