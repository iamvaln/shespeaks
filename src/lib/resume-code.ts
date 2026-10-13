// « Reprendre avec un code »: her journey is found by her email, not by the browser. The code goes by email with her personal links
// (see access.ts); typed back here, it opens her journey in the browser she is using, wherever that is.
import crypto from 'node:crypto';
import { all, get, run, tx } from './db.ts';
import { mailboxKey } from './contact.ts';
import { secret } from './secret.ts';
import { hit, ipBucket, LOGIN_WINDOW_SEC, rateKey } from './ratelimit.ts';
import type { Locale } from './questions.ts';

export const CODE_TTL_MINUTES = 15;
export const CODE_MAX_TRIES = 5;
export const CODE_MAX_PER_IP = 20;

export type Journey = { id: number; token: string; email: string; completed_at: string | null; created_at: string; city: string | null; city_other: string | null; locale: Locale };

/** The journeys of one mailbox (same rules as everywhere: case, dots and +tags of Gmail…), most recent first. */
export async function journeysOf(email: string): Promise<Journey[]> {
  const box = mailboxKey(email.trim().toLowerCase());
  if (!box) return [];
  return (await all<Journey>(
    `SELECT id,token,email,completed_at,created_at,city,city_other,locale FROM candidates WHERE email IS NOT NULL AND name IS NOT NULL ORDER BY created_at DESC LIMIT 2000`))
    .filter((r) => mailboxKey(r.email) === box);
}
/** The journey a code opens: the one she has not finished, else the most recent. */
export const resumeTarget = (rows: Journey[]): Journey | undefined => rows.find((r) => !r.completed_at) ?? rows[0];

const hashOf = (candidateId: number, code: string) => crypto.createHmac('sha256', secret()).update(`resume:${candidateId}:${code}`).digest('hex');

/** A new code for this journey (the previous one stops working). */
export async function issueCode(candidateId: number): Promise<string> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await tx(async () => {
    await run(`UPDATE resume_codes SET used_at=(now() at time zone 'utc') WHERE candidate_id=? AND used_at IS NULL`, candidateId);
    await run(`INSERT INTO resume_codes (candidate_id, code_hash, expires_at) VALUES (?, ?, (now() at time zone 'utc') + interval '${CODE_TTL_MINUTES} minutes')`, candidateId, hashOf(candidateId, code));
  });
  return code;
}

export type CodeOutcome = { token: string; completed: boolean } | { retryAfterSec: number } | { wrong: true };
/**
 * The code she typed for her email -> the journey it opens. Every wrong try counts against the live code; after five it is void, and
 * one address cannot try more than a few codes per window: six digits are not guessed.
 */
export async function verifyCode(email: string, code: string, ip: string): Promise<CodeOutcome> {
  const rate = await hit({ bucket: 'resume:ip', key: rateKey(ipBucket(ip)), max: CODE_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });
  if (!rate.ok) return { retryAfterSec: rate.retryAfterSec };
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return { wrong: true };
  const rows = await journeysOf(email);
  if (!rows.length) return { wrong: true };
  const ids = rows.map((r) => r.id).filter((n) => Number.isInteger(n)).join(','); // ids from the database: integers only
  const live = await all<{ id: number; candidate_id: number; code_hash: string }>(
    `SELECT id, candidate_id, code_hash FROM resume_codes WHERE candidate_id IN (${ids}) AND used_at IS NULL
       AND expires_at > (now() at time zone 'utc') AND attempts < ${CODE_MAX_TRIES}`);
  for (const l of live) {
    const a = Buffer.from(hashOf(l.candidate_id, typed)), b = Buffer.from(l.code_hash);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const used = await get<{ id: number }>(`UPDATE resume_codes SET used_at=(now() at time zone 'utc') WHERE id=? AND used_at IS NULL RETURNING id`, l.id);
      const j = rows.find((r) => r.id === l.candidate_id)!;
      return used ? { token: j.token, completed: !!j.completed_at } : { wrong: true };
    }
  }
  if (live.length) await run(`UPDATE resume_codes SET attempts=attempts+1 WHERE id IN (${live.map((l) => l.id).join(',')})`);
  return { wrong: true };
}
