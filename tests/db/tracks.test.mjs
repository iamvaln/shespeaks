// « Régénérer » replaces only the proposals nobody has acted on. Real Postgres. Run: npm run test:db
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
let diagnostic;
let raw;

const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_trk_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-secret';
  data = await import('../../src/lib/data.ts');
  diagnostic = await import('../../src/lib/diagnostic.ts');
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

/** A completed branch-A candidate with the answers the templates use. */
async function candidate() {
  const token = crypto.randomBytes(8).toString('hex');
  const [{ id }] = await raw`insert into candidates (token, name, email, branch, status, current_screen, completed_at)
    values (${token}, 'Test', ${token + '@example.org'}, 'A', 'diagnostic_recu', 'done', now() at time zone 'utc') returning id`;
  await data.setAnswers(id, {
    P5: 'fr', A2: ['mobile', 'web'], A3: 'Flutter, Firebase', A7: ['demo', 'lecons'],
    A4: 'Un bug tenace sur la synchronisation hors-ligne', A5: 'les tests', A6: 'les bases',
  });
  return id;
}
const tracks = (id) => raw`select id, title, origin, state from tracks where candidate_id = ${id} order by position, id`;
const setState = (tid, state) => raw`update tracks set state = ${state} where id = ${tid}`;

test('regenerating a fresh candidate gives five template proposals', { skip }, async () => {
  const id = await candidate();
  await diagnostic.regenerateTracks(id);
  const t = await tracks(id);
  assert.equal(t.length, 5);
  assert.ok(t.every((x) => x.state === 'generee' && (x.origin === 'personnelle' || x.origin === 'croisement')));
});

test('what the coach did stays: her tracks, the chosen, the shortlisted and the set-aside ones', { skip }, async () => {
  const id = await candidate();
  await diagnostic.regenerateTracks(id);
  const first = await tracks(id);
  await setState(first[0].id, 'choisie');
  await setState(first[1].id, 'retenue_coach');
  await setState(first[2].id, 'ecartee');
  await raw`insert into tracks (candidate_id, title, format, origin, position) values (${id}, 'Ma propre piste', 'talk', 'coach', 99)`;
  const untouched = [first[3].id, first[4].id];

  await diagnostic.regenerateTracks(id);
  const after = await tracks(id);
  const byId = new Map(after.map((x) => [x.id, x]));
  assert.equal(byId.get(first[0].id)?.state, 'choisie', 'the chosen track stays chosen');
  assert.equal(byId.get(first[1].id)?.state, 'retenue_coach', 'the shortlisted track stays shortlisted');
  assert.equal(byId.get(first[2].id)?.state, 'ecartee', 'the set-aside track stays set aside');
  assert.ok(after.some((x) => x.title === 'Ma propre piste' && x.origin === 'coach'), 'her own track stays');
  for (const tid of untouched) assert.equal(byId.has(tid), false, 'a proposal nobody acted on is replaced');
  const discardedTitle = first[2].title.toLowerCase();
  assert.equal(after.filter((x) => x.title.toLowerCase() === discardedTitle).length, 1, 'a set-aside title is not proposed again');
  const inPlay = after.filter((x) => x.origin !== 'coach' && x.state !== 'ecartee');
  assert.equal(inPlay.length, 5, 'five proposals in play: the chosen, the shortlisted and three new ones');
});

test('regenerating twice in a row changes nothing more', { skip }, async () => {
  const id = await candidate();
  await diagnostic.regenerateTracks(id);
  await diagnostic.regenerateTracks(id);
  const t = await tracks(id);
  assert.equal(t.length, 5);
  assert.equal(new Set(t.map((x) => x.title.toLowerCase())).size, 5, 'no duplicate title');
});

test('suggestions made by the AI are not touched by the template regeneration', { skip }, async () => {
  const id = await candidate();
  await raw`insert into tracks (candidate_id, title, format, origin, state, position) values (${id}, 'Une idée de l’IA', 'talk', 'ia', 'generee', 50)`;
  await diagnostic.regenerateTracks(id);
  const t = await tracks(id);
  assert.ok(t.some((x) => x.origin === 'ia' && x.title === 'Une idée de l’IA' && x.state === 'generee'));
  assert.equal(t.filter((x) => x.origin !== 'ia').length, 5, 'and the five templates are still there');
});
