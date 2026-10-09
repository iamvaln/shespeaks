// Rate limiting backed by Postgres, so it holds across serverless instances (an in-memory counter restarts empty on every
// cold start and is not shared between instances). Each hit is a row in `rate_limit_hits`; a per-key advisory lock makes
// "count, then record" atomic, so parallel requests cannot slip past the limit together.
import crypto from 'node:crypto';
import { isIPv6 } from 'node:net';
import { get, run, tx } from './db.ts';
import { secret } from './secret.ts';
import { mailboxKey } from './contact.ts';

export interface RateLimit { bucket: string; key: string; max: number; windowSec: number }
export interface RateResult { ok: boolean; retryAfterSec: number }

/** Opaque, non-reversible key: neither IP addresses nor email addresses are stored in clear. */
export const rateKey = (value: string): string => crypto.createHmac('sha256', secret()).update(`rate:${value}`).digest('hex').slice(0, 32);

/**
 * Client IP as set by the platform. Vercel sets x-real-ip (and overwrites x-forwarded-for) so a visitor cannot choose it;
 * on a host that does not set x-real-ip we fall back to the first x-forwarded-for hop.
 */
export function requestIp(h: Headers): string {
  return h.get('x-real-ip')?.trim() || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * What counts as « one address » for a limit: an IPv4 address as it is, an IPv4-mapped IPv6 address as its IPv4, and any other
 * IPv6 address as its /64 (one subscriber's block of 2^64 addresses): without this a single IPv6 client gets a new counter for
 * every request.
 */
export function ipBucket(ip: string): string {
  const v = ip.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return mapped[1];
  if (!isIPv6(v)) return v;
  const [head, tail = ''] = v.split('::');
  const groups = (s: string) => (s ? s.split(':') : []).flatMap((g) => {
    const dotted = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(g); // an embedded IPv4 tail is two groups
    return dotted ? [((+dotted[1] << 8) | +dotted[2]).toString(16), ((+dotted[3] << 8) | +dotted[4]).toString(16)] : [g];
  });
  const h = groups(head);
  const t = groups(tail);
  const full = v.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${full.slice(0, 4).map((g) => g.padStart(4, '0')).join(':')}::/64`;
}

/** Records one hit and tells whether it is within the limit. A refused hit is not recorded. */
export async function hit({ bucket, key, max, windowSec }: RateLimit): Promise<RateResult> {
  const res = await tx(async () => {
    await get('SELECT pg_advisory_xact_lock(hashtext(?))', `${bucket}:${key}`);
    await run(`DELETE FROM rate_limit_hits WHERE bucket=? AND key=? AND at <= (now() at time zone 'utc') - (?::int * interval '1 second')`, bucket, key, windowSec);
    const r = await get<{ c: number; age: number | null }>(
      `SELECT COUNT(*)::int AS c, EXTRACT(EPOCH FROM ((now() at time zone 'utc') - MIN(at)))::int AS age FROM rate_limit_hits WHERE bucket=? AND key=?`,
      bucket, key,
    );
    if ((r?.c ?? 0) >= max) return { ok: false, retryAfterSec: Math.max(1, windowSec - (r?.age ?? 0)) };
    await run('INSERT INTO rate_limit_hits (bucket,key) VALUES (?,?)', bucket, key);
    return { ok: true, retryAfterSec: 0 };
  });
  // housekeeping for keys that never come back (a visitor who tried once and left)
  if (Math.random() < 0.02) await run(`DELETE FROM rate_limit_hits WHERE at < (now() at time zone 'utc') - interval '1 day'`).catch(() => {});
  return res;
}

// ---- policies ---------------------------------------------------------------------------------------------------
export const LOGIN_WINDOW_SEC = 600;
export const LOGIN_MAX_PER_IP = 10; // link requests from one address, whatever the email typed
export const LOGIN_MAX_PER_EMAIL = 5; // link requests for one email, whether or not it belongs to a coach
export const VERIFY_MAX_PER_IP = 20; // attempts to use a login link from one address

/** Applies to every request of the coach login form, existing coach or not, so the answer never reveals who is a coach. */
export async function checkLoginRate(ip: string, email: string): Promise<RateResult> {
  const byIp = await hit({ bucket: 'login:ip', key: rateKey(ipBucket(ip)), max: LOGIN_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });
  if (!byIp.ok || !email) return byIp;
  return hit({ bucket: 'login:email', key: rateKey(email), max: LOGIN_MAX_PER_EMAIL, windowSec: LOGIN_WINDOW_SEC });
}

export const checkVerifyRate = (ip: string): Promise<RateResult> =>
  hit({ bucket: 'verify:ip', key: rateKey(ipBucket(ip)), max: VERIFY_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });

// ---- candidate creation (public interest form) --------------------------------------------------------------------
// Creating a candidate emails the address typed in the form, so it is an unauthenticated way to make the platform write to
// anyone. The address limit is what protects a third party; the IP limit only stops automation and is kept high enough for a
// room of candidates sharing one Wi-Fi.
export const CREATE_WINDOW_SEC = 3600;
export const CREATE_MAX_PER_IP = 30; // attempts to start the form from one address, valid or not
export const CREATE_MAX_PER_EMAIL = 3; // candidates created for one mailbox (« +tag » and Gmail dots count as the same)

export const checkCreateIp = (ip: string): Promise<RateResult> =>
  hit({ bucket: 'create:ip', key: rateKey(ipBucket(ip)), max: CREATE_MAX_PER_IP, windowSec: CREATE_WINDOW_SEC });

// Changing the address of an existing candidate also uses the mailbox allowance (the reminders and the confirmation follow the
// address on the profile), but it needs no new cookie, so it has its own ceilings: without them one cookie could use up the
// allowance of any number of mailboxes at API speed.
export const CHANGE_MAX_PER_CANDIDATE = 5; // address changes per candidate and day
export const CHANGE_MAX_PER_IP = 20; // address changes from one address and hour

export async function checkChangeRate(ip: string, candidateId: number): Promise<RateResult> {
  const byCandidate = await hit({ bucket: 'change:candidate', key: rateKey(`candidate:${candidateId}`), max: CHANGE_MAX_PER_CANDIDATE, windowSec: 86400 });
  if (!byCandidate.ok) return byCandidate;
  return hit({ bucket: 'change:ip', key: rateKey(ipBucket(ip)), max: CHANGE_MAX_PER_IP, windowSec: CREATE_WINDOW_SEC });
}

export const checkCreateEmail = (email: string): Promise<RateResult> =>
  hit({ bucket: 'create:email', key: rateKey(mailboxKey(email)), max: CREATE_MAX_PER_EMAIL, windowSec: CREATE_WINDOW_SEC });

// ---- AI title suggestions (coach space) ------------------------------------------------------------------------------
// Every request costs money and sends answers to a provider: a ceiling per coach and one per candidate, per day.
export const AI_MAX_PER_COACH = 40;
export const AI_MAX_PER_CANDIDATE = 5;
export const AI_WINDOW_SEC = 86400;

const aiLimits = (coachId: number, candidateId: number) => [
  { bucket: 'ai:coach', key: rateKey(`coach:${coachId}`), max: AI_MAX_PER_COACH, windowSec: AI_WINDOW_SEC },
  { bucket: 'ai:candidate', key: rateKey(`candidate:${candidateId}`), max: AI_MAX_PER_CANDIDATE, windowSec: AI_WINDOW_SEC },
];

export async function checkAiRate(coachId: number, candidateId: number): Promise<RateResult> {
  for (const l of aiLimits(coachId, candidateId)) {
    const r = await hit(l);
    if (!r.ok) return r;
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Gives back the allowance of a request that never reached the model (an outage must not use up a candidate's five a day). */
export async function refundAiRate(coachId: number, candidateId: number): Promise<void> {
  for (const l of aiLimits(coachId, candidateId)) {
    await run(
      `DELETE FROM rate_limit_hits WHERE id = (SELECT id FROM rate_limit_hits WHERE bucket=? AND key=? ORDER BY at DESC, id DESC LIMIT 1)`,
      l.bucket, l.key,
    );
  }
}
