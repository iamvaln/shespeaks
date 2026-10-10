// Automatic reminders against a real Postgres: nobody is told to finish a form she has finished. Run: npm run test:db
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
let dbName = '';
let data;
let reminders;
let raw;

const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_rem_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-secret';
  delete process.env.RESEND_API_KEY; // emails are only recorded in email_log, never sent
  data = await import('../../src/lib/data.ts');
  reminders = await import('../../src/lib/reminders.ts');
  raw = postgres(url, { max: 2, onnotice: () => {} });
});
after(async () => {
  if (!admin) return;
  await raw?.end();
  const db = await import('../../src/lib/db.ts');
  await db.sql().end();
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.end();
});

/** An unfinished candidate, idle for three days, with an address. */
async function candidate(over = {}) {
  const token = crypto.randomBytes(8).toString('hex');
  const email = over.email ?? token + '@example.org';
  const [{ id }] = await raw`insert into candidates (token, name, email, status, current_screen, last_activity_at)
    values (${token}, ${'Test ' + token}, ${email}, 'en_cours', 'c2', now() at time zone 'utc' - interval '3 days') returning id`;
  if (over.completed) await raw`update candidates set completed_at = now() at time zone 'utc', status = 'diagnostic_recu', current_screen = 'done' where id = ${id}`;
  if (over.status) await raw`update candidates set status = ${over.status} where id = ${id}`;
  return id;
}
const row = async (id) => (await raw`select reminders_sent, last_reminder_at from candidates where id = ${id}`)[0];
const mails = async (id) => (await raw`select kind from email_log where candidate_id = ${id} order by id`).map((m) => m.kind);

test('claiming a reminder: one winner per slot, the counter moves once', { skip }, async () => {
  const id = await candidate();
  assert.equal(await data.claimReminder(id, 0), true);
  assert.equal(await data.claimReminder(id, 0), false, 'the same slot cannot be taken twice (two overlapping runs)');
  const r = await row(id);
  assert.equal(r.reminders_sent, 1);
  assert.ok(r.last_reminder_at, 'the time of the reminder is recorded');
  assert.equal(await data.claimReminder(id, 1), true, 'the next slot is free');
  assert.equal((await row(id)).reminders_sent, 2);
});

test('a candidate who finished since the list was read is not claimed', { skip }, async () => {
  const id = await candidate({ completed: true });
  assert.equal(await data.claimReminder(id, 0), false);
  const r = await row(id);
  assert.equal(r.reminders_sent, 0);
  assert.equal(r.last_reminder_at, null);
});

test('a candidate a coach has set aside since the list was read is not claimed', { skip }, async () => {
  const id = await candidate({ status: 'non_retenue' });
  assert.equal(await data.claimReminder(id, 0), false);
  assert.equal((await row(id)).reminders_sent, 0);
});

test('the run reminds an unfinished candidate once per slot and skips one who finished', { skip }, async () => {
  const waiting = await candidate();
  const done = await candidate({ completed: true });
  const first = await reminders.runReminders();
  const ids = first.due.map((d) => d.id);
  assert.ok(ids.includes(waiting), 'the waiting candidate is reminded');
  assert.ok(!ids.includes(done), 'the one who finished is not');
  assert.deepEqual(await mails(waiting), ['candidate_reminder_1']);
  assert.deepEqual(await mails(done), []);
  const again = await reminders.runReminders();
  assert.ok(!again.due.some((d) => d.id === waiting), 'a second run right after finds nothing due');
  assert.deepEqual(await mails(waiting), ['candidate_reminder_1']);
});

test('candidates parked on one mailbox get one reminder email per run, and every one of them is still claimed and reported to the coaches', { skip }, async () => {
  const a = await candidate({ email: 'Parked.Person+one@gmail.com' });
  const b = await candidate({ email: 'parkedperson+two@googlemail.com' });
  const c = await candidate({ email: 'parkedperson@gmail.com' });
  const other = await candidate({ email: 'someone-else@example.org' });
  const report = await reminders.runReminders();
  const ids = report.due.map((d) => d.id);
  for (const id of [a, b, c, other]) assert.ok(ids.includes(id), `candidate ${id} is reported (coach digest)`);
  const sent = (await Promise.all([a, b, c].map(mails))).flat();
  assert.deepEqual(sent, ['candidate_reminder_1'], 'one email for the three candidates of that mailbox');
  assert.deepEqual(await mails(other), ['candidate_reminder_1'], 'another mailbox is not affected');
  for (const id of [a, b, c]) assert.equal((await row(id)).reminders_sent, 1, `candidate ${id} is claimed`);
  const again = await reminders.runReminders();
  assert.ok(![a, b, c].some((id) => again.due.some((d) => d.id === id)), 'none of them is due again right away');
});
