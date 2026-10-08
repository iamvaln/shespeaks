// Rate limiting backed by Postgres, so it holds across serverless instances (an in-memory counter restarts empty on every
// cold start and is not shared between instances). Each hit is a row in `rate_limit_hits`; a per-key advisory lock makes
// "count, then record" atomic, so parallel requests cannot slip past the limit together.
import crypto from 'node:crypto';
import { get, run, tx } from './db.ts';
import { secret } from './secret.ts';

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
  const byIp = await hit({ bucket: 'login:ip', key: rateKey(ip), max: LOGIN_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });
  if (!byIp.ok || !email) return byIp;
  return hit({ bucket: 'login:email', key: rateKey(email), max: LOGIN_MAX_PER_EMAIL, windowSec: LOGIN_WINDOW_SEC });
}

export const checkVerifyRate = (ip: string): Promise<RateResult> =>
  hit({ bucket: 'verify:ip', key: rateKey(ip), max: VERIFY_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });
