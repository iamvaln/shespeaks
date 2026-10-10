// A query that gets no answer fails after a delay instead of holding the page, and slow queries are logged. Real Postgres. Run: npm run test:db
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const url = resolveDatabaseUrl(process.env);
const skip = url ? false : 'DATABASE_URL not set';
let db;
if (url) {
  process.env.DATABASE_URL = url;
  db = await import('../../src/lib/db.ts');
}
after(async () => {
  delete process.env.DB_QUERY_TIMEOUT_MS;
  delete process.env.DB_SLOW_QUERY_MS;
  if (db) await db.sql().end();
});

/** Silences and records console output while a test runs. */
function capture(method) {
  const lines = [];
  const original = console[method];
  console[method] = (...a) => lines.push(a.join(' '));
  return { lines, restore: () => { console[method] = original; } };
}

test('a query that does not answer fails after the delay with a clear error, and the next query works', { skip }, async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '400';
  const logged = capture('error');
  const started = Date.now();
  try {
    await assert.rejects(db.all('SELECT pg_sleep(5)'), (e) => e.name === 'DbTimeoutError' && /pg_sleep/.test(e.message));
  } finally { logged.restore(); }
  assert.ok(Date.now() - started < 3000, `it did not wait for the 5 s query (${Date.now() - started} ms)`);
  assert.ok(logged.lines.some((l) => l.includes('[db] no answer after 400 ms') && l.includes('pg_sleep')), 'the log names the statement');
  delete process.env.DB_QUERY_TIMEOUT_MS;
  assert.deepEqual(await db.get('SELECT 1 AS one'), { one: 1 }, 'a fresh pool serves the next query');
});

test('inside a transaction too: the page is not held, and the next query works', { skip }, async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '400';
  const logged = capture('error');
  const started = Date.now();
  try {
    await assert.rejects(db.tx(async () => { await db.all('SELECT 1'); await db.all('SELECT pg_sleep(5)'); }), (e) => e.name === 'DbTimeoutError');
  } finally { logged.restore(); }
  assert.ok(Date.now() - started < 3000, `the transaction did not wait for the 5 s query (${Date.now() - started} ms)`);
  delete process.env.DB_QUERY_TIMEOUT_MS;
  assert.deepEqual(await db.get('SELECT 2 AS two'), { two: 2 });
});

test('a slow query is logged with its statement and never its values; a fast one is not', { skip }, async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '5000';
  process.env.DB_SLOW_QUERY_MS = '100';
  const warned = capture('warn');
  try {
    await db.all('SELECT pg_sleep(?::float) AS s, ?::text AS secret', 0.3, 'secret-value-123');
    await db.all('SELECT 1');
  } finally { warned.restore(); }
  assert.equal(warned.lines.length, 1, warned.lines.join(' | '));
  assert.match(warned.lines[0], /\[db\] slow query, \d+ ms: SELECT pg_sleep/);
  assert.ok(!warned.lines[0].includes('secret-value-123'), 'the values never reach the log');
});

test('an ordinary error is still the database error, not a timeout', { skip }, async () => {
  await assert.rejects(db.all('SELECT * FROM a_table_that_does_not_exist'), (e) => e.name !== 'DbTimeoutError' && /does not exist|out of date/.test(e.message));
});
