// Integration tests for scripts/db.mjs against a real Postgres (set DATABASE_URL to a role allowed to CREATE DATABASE).
// Each test group uses its own throwaway database. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const NODE = ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs'];
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
const created = [];

const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };
async function freshDb() {
  const name = `ss_t_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${name}`);
  created.push(name);
  return { name, url: urlFor(name) };
}
const cli = (url, args, env = {}) => spawnSync('node', [...NODE, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url, ...env } });
const cliAsync = (url, args) => new Promise((res) => { const p = spawn('node', [...NODE, ...args], { env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', (code) => res({ status: code, out })); });
const count = async (url, table) => { const s = postgres(url, { max: 1, onnotice: () => {} }); try { return (await s.unsafe(`select count(*)::int as n from ${table}`))[0].n; } finally { await s.end(); } };
const nFiles = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length;

after(async () => { if (!admin) return; for (const n of created) await admin.unsafe(`drop database if exists ${n} with (force)`); await admin.end(); });

test('migrate applies every file once and records it; rerun is a no-op', { skip }, async () => {
  const { url } = await freshDb();
  const a = cli(url, ['migrate']);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(await count(url, 'schema_migrations'), nFiles);
  assert.equal(await count(url, 'coaches'), 0, 'migrate must not seed');
  const b = cli(url, ['migrate']);
  assert.equal(b.status, 0);
  assert.match(b.stdout, /nothing to apply/);
  const s = cli(url, ['status']);
  assert.match(s.stdout, new RegExp(`${nFiles} applied, 0 pending`));
});

test('editing an applied migration is refused (exit 1) and nothing else runs', { skip }, async () => {
  const { url } = await freshDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of fs.readdirSync('supabase/migrations')) fs.copyFileSync(path.join('supabase/migrations', f), path.join(dir, f));
  assert.equal(cli(url, ['migrate'], { MIGRATIONS_DIR: dir }).status, 0);
  fs.appendFileSync(path.join(dir, '0001_init.sql'), '\n-- sneaky edit\n');
  fs.writeFileSync(path.join(dir, '0003_new.sql'), 'create table should_not_exist (id int);');
  const r = cli(url, ['migrate'], { MIGRATIONS_DIR: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /edited after being applied: 0001_init\.sql/);
  const s = postgres(url, { max: 1 });
  const [{ t }] = await s`select to_regclass('public.should_not_exist') as t`;
  await s.end();
  assert.equal(t, null, 'a pending migration must not run when an applied one was edited');
  assert.equal(cli(url, ['status'], { MIGRATIONS_DIR: dir }).status, 1);
});

test('a failing migration rolls back completely and is not recorded', { skip }, async () => {
  const { url } = await freshDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.writeFileSync(path.join(dir, '0001_ok.sql'), 'create table a (id int);');
  fs.writeFileSync(path.join(dir, '0002_bad.sql'), 'create table b (id int); select * from does_not_exist;');
  const r = cli(url, ['migrate'], { MIGRATIONS_DIR: dir });
  assert.equal(r.status, 1);
  const s = postgres(url, { max: 1 });
  const [{ a, b }] = await s`select to_regclass('public.a') as a, to_regclass('public.b') as b`;
  const rows = await s`select filename from schema_migrations`;
  await s.end();
  assert.ok(a && !b, 'first file kept, failed file fully rolled back');
  assert.deepEqual(rows.map((x) => x.filename), ['0001_ok.sql']);
});

test('two builds migrating at the same time: no error, each file applied exactly once', { skip }, async () => {
  const { url } = await freshDb();
  const results = await Promise.all([cliAsync(url, ['setup']), cliAsync(url, ['setup']), cliAsync(url, ['setup'])]);
  for (const r of results) assert.equal(r.status, 0, r.out);
  assert.equal(await count(url, 'schema_migrations'), nFiles);
  assert.equal(await count(url, 'devfest_events'), 3);
});

test('seed is idempotent and never overwrites what a coach edited', { skip }, async () => {
  const { url } = await freshDb();
  const env = { ADMIN_EMAIL: 'Boss@Example.com', ADMIN_NAME: 'Boss' };
  assert.equal(cli(url, ['setup'], env).status, 0);
  const s = postgres(url, { max: 1 });
  await s`update devfest_events set event_date='2026-12-05', venue='Palais' where city='bamenda'`;
  await s`update coaches set name='Renamed'`;
  await s.end();
  assert.equal(cli(url, ['seed'], { ...env, ADMIN_EMAIL: 'other@example.com' }).status, 0);
  const t = postgres(url, { max: 1 });
  const [b] = await t`select event_date, venue from devfest_events where city='bamenda'`;
  const coaches = await t`select name, email from coaches`;
  await t.end();
  assert.deepEqual({ ...b }, { event_date: '2026-12-05', venue: 'Palais' });
  assert.deepEqual(coaches.map((c) => ({ ...c })), [{ name: 'Renamed', email: 'boss@example.com' }]);
});

test('deploy (the Vercel build step) honours MIGRATE_ON_BUILD and only runs on Vercel', { skip }, async () => {
  const { url } = await freshDb();
  const run = (env) => cli(url, ['deploy'], env);
  assert.match(run({}).stdout, /skipped, not on Vercel/);
  assert.match(run({ VERCEL: '1', VERCEL_ENV: 'preview', MIGRATE_ON_BUILD: 'false' }).stdout, /MIGRATE_ON_BUILD=false/);
  assert.match(run({ VERCEL: '1', VERCEL_ENV: 'preview', MIGRATE_ON_BUILD: 'production' }).stdout, /this is a preview build/);
  assert.equal(await count(url, 'schema_migrations').catch(() => 0), 0, 'nothing applied by the skipped runs');
  const ok = run({ VERCEL: '1', VERCEL_ENV: 'production', MIGRATE_ON_BUILD: 'production' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(await count(url, 'schema_migrations'), nFiles);
  const prev = run({ VERCEL: '1', VERCEL_ENV: 'preview' }); // default: all environments
  assert.match(prev.stdout, /nothing to apply/);
});

test('POSTGRES_URL with the Supabase integration "supa" parameter works', { skip }, async () => {
  const { url } = await freshDb();
  const r = spawnSync('node', [...NODE, 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, POSTGRES_URL: `${url}?supa=base-pooler.x` } });
  assert.equal(r.status, 0, r.stderr);
});

test('app runtime: a missing table gives an actionable message, not a bare Postgres error', { skip }, async () => {
  const { url } = await freshDb(); // empty database, no migrations
  process.env.POSTGRES_URL = url;
  delete process.env.DATABASE_URL;
  const db = await import(`../../src/lib/db.ts?x=${Date.now()}`);
  await assert.rejects(() => db.get('select * from devfest_events'), (e) => /npm run db:setup/.test(e.message) && /redeploy on Vercel/.test(e.message));
  await db.sql().end();
});

test('0003: existing events get a public title; the Douala link is only replaced if nobody edited it', { skip }, async () => {
  const { url } = await freshDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of ['0001_init.sql', '0002_email_provider_id.sql']) fs.copyFileSync(path.join('supabase/migrations', f), path.join(dir, f));
  assert.equal(cli(url, ['migrate'], { MIGRATIONS_DIR: dir }).status, 0); // database as it was before 0003
  const s = postgres(url, { max: 1, onnotice: () => {} });
  await s`insert into devfest_events (city,name,event_date,submission_url) values ('kribi','Kribi','2027-03-01',null), ('douala','Douala','2026-11-28','https://devfest.gdgdouala.org/cfp'), ('yaounde','Yaoundé','2026-11-21','https://my-own-link.example')`;
  fs.copyFileSync('supabase/migrations/0003_events_title_poster.sql', path.join(dir, '0003_events_title_poster.sql'));
  assert.equal(cli(url, ['migrate'], { MIGRATIONS_DIR: dir }).status, 0);
  const rows = Object.fromEntries((await s`select city, title, submission_url from devfest_events`).map((r) => [r.city, r]));
  await s.end();
  assert.equal(rows.kribi.title, 'DevFest Kribi 2027');
  assert.equal(rows.douala.title, 'DevFest Douala 2026');
  assert.equal(rows.douala.submission_url, 'https://bit.ly/speakersdevfest26', 'untouched default is replaced by the official link');
  assert.equal(rows.yaounde.submission_url, 'https://my-own-link.example', 'an edited link is left alone');
});

test('seed gives every event its public title and never overwrites an edited one', { skip }, async () => {
  const { url } = await freshDb();
  assert.equal(cli(url, ['setup']).status, 0);
  const s = postgres(url, { max: 1, onnotice: () => {} });
  const titles = (await s`select title from devfest_events order by city`).map((r) => r.title);
  assert.deepEqual(titles, ['DevFest Bamenda 2026', 'DevFest Douala 2026', 'DevFest Yaoundé 2026']);
  await s`update devfest_events set title='DevFest Douala (édition 2026)', poster_url='/events/douala.jpg' where city='douala'`;
  await s.end();
  assert.equal(cli(url, ['seed']).status, 0);
  const t = postgres(url, { max: 1, onnotice: () => {} });
  const [d] = await t`select title, poster_url from devfest_events where city='douala'`;
  await t.end();
  assert.deepEqual({ ...d }, { title: 'DevFest Douala (édition 2026)', poster_url: '/events/douala.jpg' });
});
