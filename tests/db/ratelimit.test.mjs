// Rate limiter (coach login) against a real Postgres. Run: npm run test:db
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
let rl;
let raw;

const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_rl_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-secret';
  rl = await import('../../src/lib/ratelimit.ts');
  raw = postgres(url, { max: 2, onnotice: () => {}, types: { ts: { to: 1114, from: [1114], serialize: (x) => String(x), parse: (x) => x.slice(0, 19) } } });
});
after(async () => {
  if (!admin) return;
  await raw?.end();
  const db = await import('../../src/lib/db.ts');
  await db.sql().end();
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.end();
});

const rows = async (bucket, key) => (await raw`select count(*)::int as n from rate_limit_hits where bucket=${bucket} and key=${key}`)[0].n;

test('allows up to the limit, then refuses with a retry delay, and a refused hit is not recorded', { skip }, async () => {
  const l = { bucket: 't1', key: 'k', max: 3, windowSec: 600 };
  for (let i = 0; i < 3; i++) assert.equal((await rl.hit(l)).ok, true, `hit ${i + 1}`);
  const blocked = await rl.hit(l);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 600, `retryAfterSec ${blocked.retryAfterSec}`);
  assert.equal(await rows('t1', 'k'), 3);
  assert.equal((await rl.hit(l)).ok, false, 'still refused, and the window does not slide forward while refused');
  assert.equal(await rows('t1', 'k'), 3);
});

test('keys and buckets are independent', { skip }, async () => {
  const a = { bucket: 't2', key: 'a', max: 1, windowSec: 600 };
  assert.equal((await rl.hit(a)).ok, true);
  assert.equal((await rl.hit(a)).ok, false);
  assert.equal((await rl.hit({ ...a, key: 'b' })).ok, true, 'another key');
  assert.equal((await rl.hit({ ...a, bucket: 't2-other' })).ok, true, 'another bucket');
});

test('hits older than the window stop counting, and the retry delay follows the oldest hit', { skip }, async () => {
  await raw`insert into rate_limit_hits (bucket,key,at) select 't3','k',(now() at time zone 'utc') - interval '11 minutes' from generate_series(1,3)`;
  const l = { bucket: 't3', key: 'k', max: 3, windowSec: 600 };
  assert.equal((await rl.hit(l)).ok, true, 'expired hits are ignored');
  assert.equal(await rows('t3', 'k'), 1, 'and removed');

  await raw`insert into rate_limit_hits (bucket,key,at) select 't3b','k',(now() at time zone 'utc') - interval '9 minutes' from generate_series(1,3)`;
  const blocked = await rl.hit({ bucket: 't3b', key: 'k', max: 3, windowSec: 600 });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 55 && blocked.retryAfterSec <= 61, `about a minute left, got ${blocked.retryAfterSec}`);
});

test('parallel requests cannot slip past the limit together', { skip }, async () => {
  const l = { bucket: 't4', key: 'k', max: 5, windowSec: 600 };
  const results = await Promise.all(Array.from({ length: 25 }, () => rl.hit(l)));
  assert.equal(results.filter((r) => r.ok).length, 5);
  assert.equal(await rows('t4', 'k'), 5);
});

test('coach login: 5 requests per email whether or not it is a coach, 10 per IP whatever the email', { skip }, async () => {
  const ip = '203.0.113.7';
  for (let i = 0; i < 5; i++) assert.equal((await rl.checkLoginRate(ip, 'nobody@example.com')).ok, true, `unknown address, request ${i + 1}`);
  const sixth = await rl.checkLoginRate(ip, 'nobody@example.com');
  assert.equal(sixth.ok, false, 'an address that is not a coach is limited exactly like one that is');
  assert.ok(sixth.retryAfterSec > 0);
  // 5 of this IP's 10 requests are used up; the refused one still counted for the IP
  for (let i = 0; i < 4; i++) assert.equal((await rl.checkLoginRate(ip, `other${i}@example.com`)).ok, true, `other address ${i}`);
  const eleventh = await rl.checkLoginRate(ip, 'fresh@example.com');
  assert.equal(eleventh.ok, false, 'IP limit reached even for an address never used before');
  assert.equal((await rl.checkLoginRate('203.0.113.8', 'fresh@example.com')).ok, true, 'another IP is not affected');
  assert.equal((await rl.checkLoginRate('203.0.113.9', 'nobody@example.com')).ok, false, 'the email limit follows the address across IPs');
});

test('login link verification: 20 attempts per IP', { skip }, async () => {
  for (let i = 0; i < 20; i++) assert.equal((await rl.checkVerifyRate('198.51.100.1')).ok, true);
  assert.equal((await rl.checkVerifyRate('198.51.100.1')).ok, false);
  assert.equal((await rl.checkVerifyRate('198.51.100.2')).ok, true);
});

test('keys are opaque and the client IP comes from the platform headers', { skip }, async () => {
  const k = rl.rateKey('203.0.113.7');
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.equal(k, rl.rateKey('203.0.113.7'));
  assert.notEqual(k, rl.rateKey('203.0.113.8'));
  await rl.checkLoginRate('203.0.113.99', 'someone@example.com'); // own rows: this test must also pass when run alone
  await rl.checkVerifyRate('198.51.100.99');
  const stored = await raw`select key from rate_limit_hits where bucket in ('login:ip','login:email','verify:ip')`;
  assert.ok(stored.length >= 3);
  for (const r of stored) assert.ok(!/203\.0\.113|example\.com/.test(r.key), 'no raw IP or email stored');
  assert.equal(rl.requestIp(new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9, 2.2.2.2' })), '1.1.1.1');
  assert.equal(rl.requestIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 2.2.2.2' })), '9.9.9.9');
  assert.equal(rl.requestIp(new Headers()), 'unknown');
});

test('candidate creation: 3 per mailbox and hour; +tags and Gmail dots are the same mailbox; dots elsewhere are not', { skip }, async () => {
  for (const e of ['ada.lovelace@gmail.com', 'AdaLovelace+club@Gmail.com', 'a.d.a.lovelace@googlemail.com']) assert.equal((await rl.checkCreateEmail(e)).ok, true, e);
  const refused = await rl.checkCreateEmail('adalovelace@gmail.com');
  assert.equal(refused.ok, false, 'the fourth start for the same mailbox is refused');
  assert.ok(refused.retryAfterSec > 0 && refused.retryAfterSec <= rl.CREATE_WINDOW_SEC);
  assert.equal((await rl.checkCreateEmail('grace@gmail.com')).ok, true, 'another mailbox is not affected');
  for (let i = 0; i < rl.CREATE_MAX_PER_EMAIL; i++) assert.equal((await rl.checkCreateEmail(i % 2 ? 'a.b@example.org' : 'A.B+x@example.org')).ok, true);
  assert.equal((await rl.checkCreateEmail('ab@example.org')).ok, true, 'a.b and ab are two mailboxes outside Gmail');
});

test('candidate creation: 30 attempts per address and hour, then refused; another address is not affected', { skip }, async () => {
  for (let i = 0; i < rl.CREATE_MAX_PER_IP; i++) assert.equal((await rl.checkCreateIp('203.0.113.9')).ok, true, `attempt ${i + 1}`);
  assert.equal((await rl.checkCreateIp('203.0.113.9')).ok, false);
  assert.equal((await rl.checkCreateIp('203.0.113.10')).ok, true);
});
