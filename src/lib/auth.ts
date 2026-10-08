// Passwordless coach login: emailed one-time link → signed session cookie.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { get, run } from './db.ts';
import type { Coach } from './data.ts';
import { appUrl, coachInvite, coachLogin, deferMail, sendMail } from './mail.ts';
import { checkLoginRate } from './ratelimit.ts';
import { secret } from './secret.ts';

const COOKIE = 'ss_admin';
const SESSION_DAYS = 14;

const sign = (v: string) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export function makeSessionValue(coachId: number): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const body = `${coachId}.${exp}`;
  return `${body}.${sign(body)}`;
}
export function readSessionValue(v: string | undefined): number | null {
  if (!v) return null;
  const [id, exp, sig] = v.split('.');
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return Number(id);
}

export async function getSessionCoach(): Promise<Coach | null> {
  const jar = await cookies();
  const id = readSessionValue(jar.get(COOKIE)?.value);
  if (!id) return null;
  const coach = await get<Coach>('SELECT * FROM coaches WHERE id=?', id);
  return coach && coach.active ? coach : null;
}

export async function requireCoach(): Promise<Coach> {
  const c = await getSessionCoach();
  if (!c) redirect('/admin/login');
  return c;
}

export async function setSession(coachId: number) {
  const jar = await cookies();
  jar.set(COOKIE, makeSessionValue(coachId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

async function createLoginLink(coachId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 15 * 60_000).toISOString().replace('T', ' ').slice(0, 19);
  await run('INSERT INTO login_tokens (token_hash,coach_id,expires_at) VALUES (?,?,?)', sha(token), coachId, expires);
  return `${appUrl()}/admin/verify?token=${token}`;
}

/** Looks the address up and, only if it belongs to a coach, creates a one-time link and emails it. Returns the link when mail is only logged (dev). */
async function sendLoginLink(e: string): Promise<string | undefined> {
  // First start: the very first login is allowed for ADMIN_EMAIL when no coach exists yet.
  if (process.env.ADMIN_EMAIL && e === process.env.ADMIN_EMAIL.trim().toLowerCase() && !(await get('SELECT 1 FROM coaches LIMIT 1'))) {
    await run('INSERT INTO coaches (name,email) VALUES (?,?)', process.env.ADMIN_NAME || 'Coach', e);
  }
  const coach = await get<Coach>('SELECT * FROM coaches WHERE email=? AND active=1', e);
  if (!coach) return undefined;
  const link = await createLoginLink(coach.id);
  const status = await sendMail({ ...coachLogin(coach.name, link), to: coach.email, kind: 'coach_login' });
  return status === 'logged' ? link : undefined;
}

/**
 * Rate limited per IP and per email (see ratelimit.ts), counting every request whether or not the email belongs to a coach.
 * Otherwise answers the same way (no account enumeration): in production the lookup, the token and the mail all run after
 * the response, so the request does exactly the same work for every address and timing tells nothing.
 * Returns the link only for the dev console (development, where mail is just logged).
 */
export async function requestLogin(email: string, ip: string): Promise<{ devLink?: string; retryAfterSec?: number }> {
  const e = email.trim().toLowerCase().slice(0, 254);
  const rate = await checkLoginRate(ip, e);
  if (!rate.ok) return { retryAfterSec: rate.retryAfterSec };
  if (!e) return {};
  if (process.env.NODE_ENV === 'production') {
    deferMail(() => sendLoginLink(e).catch((err) => console.error('[auth] login link failed', err)));
    return {};
  }
  const devLink = await sendLoginLink(e);
  return devLink ? { devLink } : {};
}

export async function inviteCoach(coach: Coach, invitedBy: string) {
  const link = await createLoginLink(coach.id);
  const m = coachInvite(coach.name, invitedBy, link);
  await sendMail({ ...m, to: coach.email, kind: 'coach_invite' });
}

export async function consumeLoginToken(token: string): Promise<Coach | null> {
  const row = await get<{ coach_id: number; expires_at: string; used: number }>('SELECT * FROM login_tokens WHERE token_hash=?', sha(token));
  if (!row || row.used) return null;
  if (new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return null;
  if ((await run('UPDATE login_tokens SET used=1 WHERE token_hash=? AND used=0', sha(token))) === 0) return null; // already consumed (race-safe)
  const coach = await get<Coach>('SELECT * FROM coaches WHERE id=? AND active=1', row.coach_id);
  return coach ?? null;
}
