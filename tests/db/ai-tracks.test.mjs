// AI title suggestions on a fiche, against a real Postgres, with a stand-in for the model. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
let dbName = '';
let data;
let ai;
let rl;
let raw;

const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_ai_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-secret';
  delete process.env.ANTHROPIC_API_KEY;
  data = await import('../../src/lib/data.ts');
  ai = await import('../../src/lib/ai-tracks.ts');
  rl = await import('../../src/lib/ratelimit.ts');
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

async function candidate({ branch = 'A', completed = true, domains = ['mobile'] } = {}) {
  const token = crypto.randomBytes(8).toString('hex');
  const [{ id }] = await raw`insert into candidates (token, name, email, branch, status, current_screen, completed_at)
    values (${token}, 'Test', ${token + '@example.org'}, ${branch}, 'diagnostic_recu', 'done', ${completed ? raw`now() at time zone 'utc'` : null}) returning id`;
  await data.setAnswers(id, { P5: 'fr', A2: domains, A3: 'Flutter', A7: ['demo'], A4: 'Un bug tenace', B1: 'cyber', B4: ['retour'] });
  return id;
}
const tracks = (id) => raw`select id, title, origin, state, domain, hook, angle, format from tracks where candidate_id = ${id} order by position, id`;

let counter = 0;
/** A stand-in for the model: returns n new titles each time it is called, and remembers what it was sent. */
function model(n = 3) {
  const sent = [];
  return {
    sent,
    client: {
      messages: {
        create: async (params) => {
          sent.push(params);
          const items = Array.from({ length: n }, () => ({ title: `Un titre suggéré numéro ${++counter} sur Flutter`, angle: 'demo', format: 'atelier', hook: 'Parce qu’elle travaille avec Flutter.' }));
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ suggestions: items }) }], usage: { input_tokens: 800, output_tokens: 500 } };
        },
      },
    },
  };
}

test('suggestions are stored as tracks of origin « ia », in the candidate\'s domain, with their hook', { skip }, async () => {
  const id = await candidate();
  const m = model(3);
  const r = await ai.suggestTracksFor(id, 1, m.client);
  assert.deepEqual(r, { ok: true, added: 3 });
  const t = await tracks(id);
  assert.equal(t.length, 3);
  for (const x of t) {
    assert.equal(x.origin, 'ia');
    assert.equal(x.state, 'generee');
    assert.equal(x.domain, 'Mobile');
    assert.equal(x.angle, 'demo');
    assert.equal(x.format, 'atelier');
    assert.match(x.hook, /Flutter/);
  }
  assert.equal(m.sent.length, 1);
  assert.ok(!JSON.stringify(m.sent[0]).includes('@example.org'), 'her email address is not sent');
});

test('asking again replaces the suggestions nobody acted on; the ones the coach handled stay; the model is told what exists', { skip }, async () => {
  const id = await candidate();
  const m = model(3);
  await ai.suggestTracksFor(id, 1, m.client);
  const first = await tracks(id);
  await raw`update tracks set state = 'retenue_coach' where id = ${first[0].id}`;
  await raw`update tracks set state = 'ecartee' where id = ${first[1].id}`;
  await raw`insert into tracks (candidate_id, title, format, origin, position) values (${id}, 'Ma propre piste', 'talk', 'coach', 99)`;

  const r = await ai.suggestTracksFor(id, 1, m.client);
  assert.deepEqual(r, { ok: true, added: 3 });
  const after = await tracks(id);
  const byId = new Map(after.map((x) => [x.id, x]));
  assert.equal(byId.get(first[0].id)?.state, 'retenue_coach');
  assert.equal(byId.get(first[1].id)?.state, 'ecartee');
  assert.equal(byId.has(first[2].id), false, 'the suggestion nobody acted on is replaced');
  assert.ok(after.some((x) => x.title === 'Ma propre piste' && x.origin === 'coach'));
  assert.equal(after.filter((x) => x.origin === 'ia' && x.state === 'generee').length, 3);
  const prompt = JSON.stringify(m.sent[1]);
  for (const x of first) assert.ok(prompt.includes(x.title), `the model is told not to repeat: ${x.title}`);
});

test('two coaches asking at the same time leave one set of suggestions, not two', { skip }, async () => {
  const id = await candidate();
  const [a, b] = await Promise.all([ai.suggestTracksFor(id, 1, model(3).client), ai.suggestTracksFor(id, 2, model(3).client)]);
  assert.equal(a.ok && b.ok, true);
  assert.equal((await tracks(id)).filter((x) => x.origin === 'ia' && x.state === 'generee').length, 3);
});

test('who can ask: only a finished form of a candidate without a precise topic', { skip }, async () => {
  const c = await candidate({ branch: 'C' });
  const unfinished = await candidate({ completed: false });
  const m = model();
  assert.deepEqual(await ai.suggestTracksFor(c, 1, m.client), { ok: false, reason: 'not_eligible' });
  assert.deepEqual(await ai.suggestTracksFor(unfinished, 1, m.client), { ok: false, reason: 'not_eligible' });
  assert.deepEqual(await ai.suggestTracksFor(999999, 1, m.client), { ok: false, reason: 'not_eligible' });
  assert.equal(m.sent.length, 0, 'nothing was sent');
});

test('without a key the feature is off and nothing is stored', { skip }, async () => {
  const id = await candidate();
  assert.deepEqual(await ai.suggestTracksFor(id, 1), { ok: false, reason: 'disabled' });
  assert.equal((await tracks(id)).length, 0);
});

test('a failing or refusing model leaves the fiche as it was and says why', { skip }, async () => {
  const id = await candidate();
  await raw`insert into tracks (candidate_id, title, format, origin, position) values (${id}, 'Déjà là', 'talk', 'croisement', 0)`;
  const refusing = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
  const down = { messages: { create: async () => { throw Object.assign(new Error('boom'), { status: 529 }); } } };
  assert.deepEqual(await ai.suggestTracksFor(id, 1, refusing), { ok: false, reason: 'refused' });
  assert.deepEqual(await ai.suggestTracksFor(id, 1, down), { ok: false, reason: 'failed' });
  assert.deepEqual((await tracks(id)).map((x) => x.title), ['Déjà là']);
});

test('limits: 5 requests per candidate and day, 40 per coach and day', { skip }, async () => {
  const id = await candidate();
  const m = model(1);
  for (let i = 0; i < rl.AI_MAX_PER_CANDIDATE; i++) assert.equal((await ai.suggestTracksFor(id, 10, m.client)).ok, true, `request ${i + 1}`);
  assert.deepEqual(await ai.suggestTracksFor(id, 10, m.client), { ok: false, reason: 'limited' });
  const other = await candidate();
  assert.equal((await ai.suggestTracksFor(other, 10, m.client)).ok, true, 'another candidate, same coach');
  assert.equal(rl.AI_MAX_PER_COACH, 40);
  assert.equal(rl.AI_MAX_PER_CANDIDATE, 5);
  assert.equal(rl.AI_WINDOW_SEC, 86400);
  for (let i = 0; i < rl.AI_MAX_PER_COACH; i++) assert.equal((await rl.checkAiRate(77, 5000 + i)).ok, true);
  assert.equal((await rl.checkAiRate(77, 6000)).ok, false, 'the forty-first request of one coach');
  assert.equal((await rl.checkAiRate(78, 6000)).ok, true, 'another coach');
});

// ---- review fixes -----------------------------------------------------------------------------------------------

const aiHits = async (coach, cand) => ({
  coach: (await raw`select count(*)::int as n from rate_limit_hits where bucket = 'ai:coach' and key = ${rl.rateKey(`coach:${coach}`)}`)[0].n,
  candidate: (await raw`select count(*)::int as n from rate_limit_hits where bucket = 'ai:candidate' and key = ${rl.rateKey(`candidate:${cand}`)}`)[0].n,
});

test('the domain is written on the suggestions only when she chose exactly one', { skip }, async () => {
  const two = await candidate({ domains: ['mobile', 'web'] });
  assert.equal((await ai.suggestTracksFor(two, 1, model(2).client)).ok, true);
  const t = await tracks(two);
  assert.equal(t.length, 2);
  assert.ok(t.every((x) => x.domain === ''), 'no domain: the model gives none per title');
  const one = await candidate();
  assert.equal((await ai.suggestTracksFor(one, 1, model(1).client)).ok, true);
  assert.equal((await tracks(one))[0].domain, 'Mobile');
});

test('a call that did not complete gives its press back; a refusal, a cut or an empty answer stay counted', { skip }, async () => {
  const id = await candidate();
  const coach = 31;
  const down = { messages: { create: async () => { throw Object.assign(new Error('boom'), { status: 529, type: 'overloaded_error', requestID: 'req_1' }); } } };
  for (let i = 0; i < 8; i++) assert.deepEqual(await ai.suggestTracksFor(id, coach, down), { ok: false, reason: 'failed' }, `outage ${i + 1} is not limited`);
  assert.deepEqual(await aiHits(coach, id), { coach: 0, candidate: 0 }, 'an outage costs nothing');

  const refusing = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
  const cut = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"sug' }] }) } };
  const empty = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'rien' }] }) } };
  for (const [client, reason] of [[refusing, 'refused'], [cut, 'truncated'], [empty, 'empty']]) {
    assert.deepEqual(await ai.suggestTracksFor(id, coach, client), { ok: false, reason });
  }
  assert.deepEqual(await aiHits(coach, id), { coach: 3, candidate: 3 }, 'produced answers stay counted');
});

test('refunding takes back one press and only that coach\'s and that candidate\'s', { skip }, async () => {
  const id = await candidate();
  const other = await candidate();
  for (let i = 0; i < 3; i++) await rl.checkAiRate(41, id);
  await rl.checkAiRate(42, other);
  await rl.refundAiRate(41, id);
  assert.deepEqual(await aiHits(41, id), { coach: 2, candidate: 2 });
  assert.deepEqual(await aiHits(42, other), { coach: 1, candidate: 1 }, 'someone else is untouched');
  await rl.refundAiRate(43, id); // a coach with no press: nothing to give back, no error
  assert.equal((await aiHits(41, id)).candidate, 1, 'the candidate counter is shared by the coaches, the refund takes the newest row of each');
});

test('the refund takes the NEWEST press: an old one must not be what leaves the count', { skip }, async () => {
  const id = await candidate();
  const coach = 44;
  const key = rl.rateKey(`candidate:${id}`);
  await raw`insert into rate_limit_hits (bucket, key, at) values ('ai:candidate', ${key}, now() at time zone 'utc' - interval '23 hours')`;
  await rl.checkAiRate(coach, id); // the press that then fails
  await rl.refundAiRate(coach, id);
  const left = await raw`select extract(epoch from (now() at time zone 'utc' - at))::int as age from rate_limit_hits where bucket = 'ai:candidate' and key = ${key}`;
  assert.equal(left.length, 1);
  assert.ok(left[0].age > 22 * 3600, `the 23 h old press is the one left (age ${left[0].age} s), not the failed one`);
});

test('a press refused for this candidate does not use up the coach\'s forty', { skip }, async () => {
  const id = await candidate();
  const coach = 45;
  for (let i = 0; i < rl.AI_MAX_PER_CANDIDATE; i++) assert.equal((await rl.checkAiRate(coach, id)).ok, true);
  for (let i = 0; i < 12; i++) assert.equal((await rl.checkAiRate(coach, id)).ok, false, `refused press ${i + 1}`);
  assert.deepEqual(await aiHits(coach, id), { coach: rl.AI_MAX_PER_CANDIDATE, candidate: rl.AI_MAX_PER_CANDIDATE }, 'only the accepted presses count');
  const other = await candidate();
  assert.equal((await rl.checkAiRate(coach, other)).ok, true, 'the same coach can still work on another candidate');
});

test('the daily window slides: 23 h old presses still count, 25 h old ones do not', { skip }, async () => {
  const id = await candidate();
  const coach = 51;
  const aged = async (hours, n) => {
    for (let i = 0; i < n; i++) {
      await raw`insert into rate_limit_hits (bucket, key, at) values ('ai:candidate', ${rl.rateKey(`candidate:${id}`)}, now() at time zone 'utc' - ${hours} * interval '1 hour')`;
    }
  };
  await aged(23, rl.AI_MAX_PER_CANDIDATE);
  const blocked = await rl.checkAiRate(coach, id);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 3000 && blocked.retryAfterSec <= 3600, `about an hour to wait, got ${blocked.retryAfterSec}`);
  await raw`delete from rate_limit_hits where bucket = 'ai:candidate' and key = ${rl.rateKey(`candidate:${id}`)}`;
  await aged(25, rl.AI_MAX_PER_CANDIDATE);
  assert.equal((await rl.checkAiRate(coach, id)).ok, true, 'older than a day: forgotten');
});

test('new suggestions go after what is already there; regenerated templates go after a coach\'s track', { skip }, async () => {
  const id = await candidate();
  await raw`insert into tracks (candidate_id, title, format, origin, position) values (${id}, 'Ma piste', 'talk', 'coach', 99)`;
  assert.equal((await ai.suggestTracksFor(id, 61, model(2).client)).ok, true);
  const positions = await raw`select origin, position from tracks where candidate_id = ${id} order by position`;
  assert.deepEqual(positions.map((p) => [p.origin, Number(p.position)]), [['coach', 99], ['ia', 100], ['ia', 101]]);
});

test('asking for suggestions leaves template proposals nobody has read alone', { skip }, async () => {
  const id = await candidate();
  await raw`insert into tracks (candidate_id, title, format, origin, position) values
    (${id}, 'Une piste modèle', 'talk', 'croisement', 0), (${id}, 'Une piste personnelle', 'talk', 'personnelle', 1)`;
  assert.equal((await ai.suggestTracksFor(id, 62, model(2).client)).ok, true);
  assert.equal((await ai.suggestTracksFor(id, 62, model(2).client)).ok, true);
  const t = await tracks(id);
  assert.deepEqual(t.filter((x) => x.origin !== 'ia').map((x) => [x.title, x.state]), [['Une piste modèle', 'generee'], ['Une piste personnelle', 'generee']]);
  assert.equal(t.filter((x) => x.origin === 'ia').length, 2);
});

test('a storage error becomes « failed » for the coach and leaves the fiche as it was (the call was made, it stays counted)', { skip }, async () => {
  const id = await candidate();
  await raw`insert into tracks (candidate_id, title, format, origin, position) values (${id}, 'Déjà là', 'talk', 'croisement', 0), (${id}, 'Ancienne suggestion', 'talk', 'ia', 1)`;
  await raw.unsafe(`create function ss_boom() returns trigger language plpgsql as $$ begin if new.origin = 'ia' then raise exception 'boom'; end if; return new; end $$`);
  await raw.unsafe(`create trigger ss_boom before insert on tracks for each row execute function ss_boom()`);
  const log = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a);
  try {
    assert.deepEqual(await ai.suggestTracksFor(id, 71, model(2).client), { ok: false, reason: 'failed' });
  } finally {
    console.error = log;
    await raw.unsafe('drop trigger ss_boom on tracks');
    await raw.unsafe('drop function ss_boom()');
  }
  assert.deepEqual((await tracks(id)).map((x) => x.title), ['Déjà là', 'Ancienne suggestion'], 'the delete of the old suggestion was rolled back with the failed inserts (one transaction)');
  assert.deepEqual(await aiHits(71, id), { coach: 1, candidate: 1 });
  assert.ok(logged.some((a) => String(a[0]).includes('could not store')), 'logged');
  assert.ok(!JSON.stringify(logged).includes('Un titre suggéré'), 'no title in the log');
});
