// Improving a candidate's subject with the AI, against a real Postgres, with stand-ins for the models. Run: npm run test:db
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
let store;
let data;
let raw;
const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_subj_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-secret';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  data = await import('../../src/lib/data.ts');
  store = await import('../../src/lib/ai-subject-store.ts');
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

async function candidate({ branch = 'C', completed = true, answers = {} } = {}) {
  const token = crypto.randomBytes(8).toString('hex');
  const [{ id }] = await raw`insert into candidates (token, name, email, branch, status, current_screen, completed_at)
    values (${token}, 'Test', ${token + '@example.org'}, ${branch}, 'diagnostic_recu', 'done', ${completed ? raw`now() at time zone 'utc'` : null}) returning id`;
  await data.setAnswers(id, { P5: 'fr', P6: 'DevOps junior', C1: 'Mon pipeline CI', 'C-abstract': 'Je raconte mon premier pipeline.', C3: 'Pourquoi automatiser', ...answers });
  return id;
}
const words = (n, w = 'mot') => Array.from({ length: n }, (_, k) => `${w}${k}`).join(' ');
const proposal = (tag) => ({ titles: [`Automatiser votre déploiement ${tag}`, `Mon premier pipeline ${tag}`, `De zéro à prod ${tag}`], abstract: words(100, tag), plan: ['Accroche', 'Idées clés', 'Démo', 'À retenir'], note: `note ${tag}` });
function claude(tag) {
  const sent = [];
  return { sent, client: { messages: { create: async (p) => { sent.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(proposal(tag)) }], usage: { input_tokens: 10, output_tokens: 20 } }; } } } };
}

test('a C candidate: the proposal is stored with its provider and model, then replaced by the next one; the prompt starts from her subject', { skip }, async () => {
  const id = await candidate();
  await raw`update candidates set ai_brief = 'Viser un public débutant' where id = ${id}`;
  const m = claude('A');
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: m.client }), { ok: true });
  assert.match(m.sent[0].messages[0].content, /<sujet_actuel>[\s\S]*Mon pipeline CI[\s\S]*Pourquoi automatiser/);
  assert.match(m.sent[0].messages[0].content, /Viser un public débutant/);
  let p = await store.getSubjectProposal(id);
  assert.equal(p.provider, 'claude');
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.deepEqual(p.titles, ['Automatiser votre déploiement A', 'Mon premier pipeline A', 'De zéro à prod A']);
  assert.equal(p.plan.length, 4);
  process.env.OPENAI_API_KEY = 'sk-proj-test';
  try {
    const fetchFn = async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposal('B')) }] }] }), { status: 200 });
    assert.deepEqual(await store.improveSubjectFor(id, 1, 'openai', { fetchFn }), { ok: true });
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
  p = await store.getSubjectProposal(id);
  assert.equal(p.provider, 'openai');
  assert.equal(p.titles[0], 'Automatiser votre déploiement B');
  assert.equal((await raw`select count(*)::int as n from subject_suggestions where candidate_id = ${id}`)[0].n, 1, 'one proposal per candidate');
});

test('the fiche\'s « Sujet retenu » is the starting point when it is filled; no subject at all is not eligible', { skip }, async () => {
  const id = await candidate({ branch: 'A', answers: { C1: '', 'C-abstract': '' } });
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: claude('x').client }), { ok: false, reason: 'not_eligible' });
  await raw`insert into subjects (candidate_id, title) values (${id}, 'Piste choisie par la coach')`;
  const m = claude('C');
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: m.client }), { ok: true });
  assert.match(m.sent[0].messages[0].content, /Titre actuel : Piste choisie par la coach/);
  const unfinished = await candidate({ completed: false });
  assert.deepEqual(await store.improveSubjectFor(unfinished, 1, 'claude', { client: claude('y').client }), { ok: false, reason: 'not_eligible' });
});

test('no key: disabled; an unusable answer keeps the previous proposal; a failure is refunded, an empty answer is counted', { skip }, async () => {
  const id = await candidate();
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'openai'), { ok: false, reason: 'disabled' });
  await store.improveSubjectFor(id, 1, 'claude', { client: claude('D').client });
  const empty = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }) } };
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: empty }), { ok: false, reason: 'empty' });
  assert.equal((await store.getSubjectProposal(id)).titles[0], 'Automatiser votre déploiement D', 'the previous proposal stays');
  const before = (await raw`select count(*)::int as n from rate_limit_hits`)[0].n;
  const down = { messages: { create: async () => { throw Object.assign(new Error('Connection error.'), {}); } } };
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: down }), { ok: false, reason: 'failed' });
  assert.equal((await raw`select count(*)::int as n from rate_limit_hits`)[0].n, before, 'a failed call gives the press back');
});

test('a cut answer (billed) stays counted against the limits; only an outage is given back', { skip }, async () => {
  const id = await candidate();
  const cut = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } };
  const before = (await raw`select count(*)::int as n from rate_limit_hits`)[0].n;
  assert.deepEqual(await store.improveSubjectFor(id, 1, 'claude', { client: cut }), { ok: false, reason: 'truncated' });
  assert.ok((await raw`select count(*)::int as n from rate_limit_hits`)[0].n > before, 'counted');
});
