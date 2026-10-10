// A database that stops answering: a peer that goes silent (what a dead pooled connection of an idle serverless instance looks like) and a lock.
// Real Postgres, behind a small TCP relay that can be told to stop forwarding and to ignore the close of the socket. Run: npm run test:db
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
const g = globalThis;
let dbName = '';
let directUrl = '';
let relay;
let db;
let lockConn;

const urlFor = (database) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${database}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

/** A TCP relay in front of Postgres. `freeze()` makes the connections open at that moment silent: they forward nothing and do not react to a close. New ones are fine. */
function startRelay(targetHost, targetPort) {
  const state = { silent: new Set(), sockets: new Set() };
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    const up = net.connect({ host: targetHost, port: targetPort, allowHalfOpen: true });
    for (const s of [client, up]) { state.sockets.add(s); s.on('error', () => {}); s.on('close', () => state.sockets.delete(s)); }
    const quiet = () => state.silent.has(client) || state.silent.has(up);
    client.on('data', (d) => { if (!quiet()) up.write(d); });
    up.on('data', (d) => { if (!quiet()) client.write(d); });
    client.on('end', () => { if (!quiet()) up.end(); });
    up.on('end', () => { if (!quiet()) client.end(); });
  });
  return new Promise((resolve) => server.listen(0, 'localhost', () => resolve({
    port: server.address().port,
    freeze: () => { state.silent = new Set(state.sockets); },
    thaw: () => { state.silent = new Set(); },
    refuse: () => { server.close(); }, // no new connection can be made; the open ones stay
    destroyAll: () => { for (const s of state.sockets) s.destroy(); },
    close: () => { for (const s of state.sockets) s.destroy(); server.close(); },
  })));
}

/** Makes db.ts open its next pool on this address (the old pool is dropped without waiting). */
function pointAt(url) {
  const old = g.__shespeaksSql;
  g.__shespeaksSql = undefined;
  old?.end({ timeout: 0 }).catch(() => {});
  process.env.DATABASE_URL = url;
}

/** Records console output while a test runs. */
function capture(method) {
  const lines = [];
  const original = console[method];
  console[method] = (...a) => lines.push(a.join(' '));
  return { lines, restore: () => { console[method] = original; } };
}

before(async () => {
  if (!admin) return;
  dbName = `ss_stall_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  directUrl = urlFor(dbName);
  const setup = postgres(directUrl, { max: 1, onnotice: () => {} });
  await setup.unsafe('create table probe (id int)');
  await setup.end();
  const target = new URL(directUrl.replace(/^postgres(ql)?:/, 'http:'));
  relay = await startRelay(target.hostname, Number(target.port) || 5432);
  process.env.SESSION_SECRET = 'test-secret';
  db = await import('../../src/lib/db.ts');
});
beforeEach(() => { delete process.env.DB_QUERY_TIMEOUT_MS; delete process.env.DB_SLOW_QUERY_MS; delete process.env.DB_FIRST_ATTEMPT_MS; relay?.thaw(); });
after(async () => {
  if (!admin) return;
  delete process.env.DB_QUERY_TIMEOUT_MS;
  await lockConn?.end({ timeout: 0 }).catch(() => {});
  relay?.close();
  const old = g.__shespeaksSql; g.__shespeaksSql = undefined; await old?.end({ timeout: 0 }).catch(() => {});
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.end();
});

const relayUrl = () => { const u = new URL(directUrl.replace(/^postgres(ql)?:/, 'http:')); u.hostname = 'localhost'; u.port = String(relay.port); return u.toString().replace(/^http:/, 'postgres:'); };
const isTimeout = (e) => e?.name === 'DbTimeoutError';

test('after a timeout the shared pool is a new one, and the next query works', { skip }, async () => {
  pointAt(directUrl);
  process.env.DB_QUERY_TIMEOUT_MS = '300';
  const before = db.sql();
  const quiet = capture('error');
  try { await assert.rejects(db.all('SELECT pg_sleep(3)'), isTimeout); } finally { quiet.restore(); }
  assert.notEqual(db.sql(), before, 'the pool of the stalled connection was dropped');
  assert.deepEqual(await db.get('SELECT 1 AS one'), { one: 1 });
});

test('a query that finished leaves its timer behind harmless: the pool is not replaced later', { skip }, async () => {
  pointAt(directUrl);
  process.env.DB_QUERY_TIMEOUT_MS = '200';
  const pool = db.sql();
  const noise = capture('error');
  try {
    assert.deepEqual(await db.get('SELECT 1 AS one'), { one: 1 });
    await sleep(500); // past the 200 ms limit
  } finally { noise.restore(); }
  assert.equal(db.sql(), pool, 'the pool was not replaced by a stale timer');
  assert.equal(noise.lines.length, 0, noise.lines.join(' | '));
});

test('a silent peer in the middle of a transaction: it fails with the timeout, quickly (a parametrised statement)', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_QUERY_TIMEOUT_MS = '400';
  await db.get('SELECT 1 AS one');
  const quiet = capture('error');
  const started = Date.now();
  try {
    await assert.rejects(db.tx(async () => { await db.all('SELECT 1'); relay.freeze(); await db.all('SELECT ?::int AS n', 1); }), isTimeout);
  } finally { quiet.restore(); }
  assert.ok(Date.now() - started < 4000, `the transaction was not held (${Date.now() - started} ms)`);
});

test('a silent peer when the transaction starts (BEGIN): it fails with the timeout, quickly', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_QUERY_TIMEOUT_MS = '400';
  await db.get('SELECT 1 AS one'); // a warm pool: its connections are the ones that went quiet
  relay.freeze();
  const quiet = capture('error');
  const started = Date.now();
  try {
    await assert.rejects(db.tx(async () => { await db.all('SELECT 1'); }), isTimeout);
  } finally { quiet.restore(); }
  assert.ok(Date.now() - started < 4000, `the transaction was not held (${Date.now() - started} ms)`);
});

test('a silent peer when the transaction ends (COMMIT): it fails with the timeout, quickly', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_QUERY_TIMEOUT_MS = '400';
  await db.get('SELECT 1 AS one');
  const quiet = capture('error');
  const started = Date.now();
  try {
    await assert.rejects(db.tx(async () => { await db.all('SELECT 1'); relay.freeze(); }), isTimeout);
  } finally { quiet.restore(); }
  assert.ok(Date.now() - started < 4000, `the transaction was not held (${Date.now() - started} ms)`);
});

test('a stalled query does not break the healthy requests of the same instance', { skip }, async () => {
  pointAt(directUrl);
  lockConn = postgres(directUrl, { max: 1, onnotice: () => {} });
  await lockConn.unsafe('BEGIN');
  await lockConn.unsafe('LOCK TABLE probe IN ACCESS EXCLUSIVE MODE'); // every read of « probe » now waits
  process.env.DB_QUERY_TIMEOUT_MS = '700';
  const quiet = capture('error');
  try {
    const stalled = db.all('SELECT * FROM probe');
    const stalledSettled = assert.rejects(stalled, isTimeout);
    await sleep(250);
    const healthyQuery = db.get('SELECT pg_sleep(0.6), 1 AS ok'); // started at 250 ms, still running when the stalled one times out (at 700 ms), well inside its own limit
    const healthyTransaction = db.tx(async () => { await db.all('SELECT 1'); await sleep(900); return db.get('SELECT 2 AS two'); }); // idle between two statements when it happens
    await stalledSettled;
    assert.equal((await healthyQuery).ok, 1, 'a healthy query in flight finishes');
    assert.deepEqual(await healthyTransaction, { two: 2 }, 'a healthy transaction between two statements finishes');
  } finally { quiet.restore(); await lockConn.unsafe('ROLLBACK').catch(() => {}); await lockConn.end({ timeout: 0 }).catch(() => {}); lockConn = undefined; }
});

test('a statement nobody waits for any more is cancelled on the server, and the lock it holds is released', { skip }, async () => {
  pointAt(directUrl);
  process.env.DB_QUERY_TIMEOUT_MS = '300';
  const watcher = postgres(directUrl, { max: 1, onnotice: () => {} });
  const quiet = capture('error');
  try {
    await assert.rejects(db.all('SELECT pg_sleep(25) AS sleeping'), isTimeout);
    await assert.rejects(db.tx(async () => { await db.all('SELECT pg_advisory_xact_lock(424242)'); await db.all('SELECT pg_sleep(25) AS holding'); }), isTimeout);
    await sleep(800);
    const [{ running }] = await watcher.unsafe(`select count(*)::int as running from pg_stat_activity where datname = current_database() and state = 'active' and query like '%pg_sleep(25)%' and pid <> pg_backend_pid()`);
    assert.equal(running, 0, 'no abandoned statement is still running on the server');
    const [{ locks }] = await watcher.unsafe(`select count(*)::int as locks from pg_locks where locktype = 'advisory' and objid = 424242 and granted`);
    assert.equal(locks, 0, 'the advisory lock of the abandoned transaction is released');
  } finally { quiet.restore(); await watcher.end({ timeout: 0 }); }
});

test('a stale timer does not drop the pool that replaced the stalled one', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_QUERY_TIMEOUT_MS = '600';
  await Promise.all([db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)')]); // three warm connections
  relay.freeze(); // the connections open now go silent; the ones opened later are fine
  const quiet = capture('error');
  try {
    const first = assert.rejects(db.get('SELECT 1'), isTimeout);
    await sleep(300);
    const second = assert.rejects(db.get('SELECT 2'), isTimeout); // its timer fires at 900 ms, on the pool that was already dropped at 600 ms
    await first;
    const replacement = db.sql();
    assert.deepEqual(await db.get('SELECT 3 AS three'), { three: 3 }, 'the new pool works');
    await second;
    assert.equal(db.sql(), replacement, 'the second timer left the new pool alone');
  } finally { quiet.restore(); }
});


test('a read that gets no answer on a dead connection is repeated on a new pool: the page does not fail', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_FIRST_ATTEMPT_MS = '300';
  process.env.DB_QUERY_TIMEOUT_MS = '3000';
  await Promise.all([db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)')]); // three warm connections
  const pool = db.sql();
  relay.freeze(); // all three die; the connections opened later are fine
  const logs = capture('error'); const warns = capture('warn');
  const started = Date.now();
  try {
    assert.deepEqual(await db.get('SELECT 1 AS one'), { one: 1 });
  } finally { logs.restore(); warns.restore(); delete process.env.DB_FIRST_ATTEMPT_MS; }
  assert.ok(Date.now() - started < 2500, `the first attempt was short (${Date.now() - started} ms)`);
  assert.notEqual(db.sql(), pool, 'the dead pool was replaced');
  assert.ok(warns.lines.some((l) => l.includes('repeating once')), warns.lines.join(' | '));
});

test('a page worth of parallel reads on a pool with dead connections all come back (the fiche loads nine at once)', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_FIRST_ATTEMPT_MS = '300';
  process.env.DB_QUERY_TIMEOUT_MS = '3000';
  await Promise.all([db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)'), db.get('SELECT pg_sleep(0.1)')]);
  relay.freeze();
  const logs = capture('error'); const warns = capture('warn');
  let rows;
  try {
    rows = await Promise.all(Array.from({ length: 9 }, (_, i) => db.get('SELECT ?::int AS n', i + 1)));
  } finally { logs.restore(); warns.restore(); delete process.env.DB_FIRST_ATTEMPT_MS; }
  assert.deepEqual(rows.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a write is never repeated: on a dead connection it fails once with the timeout and nothing reaches the table', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_FIRST_ATTEMPT_MS = '300';
  process.env.DB_QUERY_TIMEOUT_MS = '600';
  await db.get('SELECT 1 AS one');
  relay.freeze();
  const logs = capture('error'); const warns = capture('warn');
  try {
    await assert.rejects(db.run('INSERT INTO probe (id) VALUES (?)', 77), isTimeout);
  } finally { logs.restore(); warns.restore(); delete process.env.DB_FIRST_ATTEMPT_MS; }
  assert.ok(!warns.lines.some((l) => l.includes('repeating once')), 'no second attempt');
  const direct = postgres(directUrl, { max: 1, onnotice: () => {} });
  const [{ n }] = await direct.unsafe('select count(*)::int as n from probe where id = 77');
  await direct.end({ timeout: 0 });
  assert.equal(n, 0);
});

test('a read cut because its pool was replaced is repeated on the new pool', { skip }, async () => {
  pointAt(directUrl);
  process.env.DB_QUERY_TIMEOUT_MS = '5000';
  const warns = capture('warn');
  try {
    const reading = db.get('SELECT pg_sleep(0.4), 5 AS five');
    await sleep(100);
    const old = g.__shespeaksSql; g.__shespeaksSql = undefined; old.end({ timeout: 0 }).catch(() => {}); // what a reset by another request does
    assert.equal((await reading).five, 5);
  } finally { warns.restore(); }
  assert.ok(warns.lines.some((l) => l.includes('repeating once')), warns.lines.join(' | '));
});

// keep this one last: the relay stops accepting connections
test('an annulment that cannot connect is not an unhandled rejection', { skip }, async () => {
  pointAt(relayUrl());
  process.env.DB_QUERY_TIMEOUT_MS = '300';
  await db.get('SELECT 1 AS one');
  relay.freeze();
  relay.refuse(); // neither the cancel request nor a new pool can connect any more
  const rejections = [];
  const onRejection = (e) => rejections.push(String(e));
  process.on('unhandledRejection', onRejection);
  const quiet = capture('error');
  try {
    await assert.rejects(db.get('SELECT 1 AS one'), isTimeout);
    await sleep(800);
  } finally { quiet.restore(); process.off('unhandledRejection', onRejection); }
  assert.deepEqual(rejections, []);
});
