// Passwordless coach login: emailed one-time link → signed session cookie.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { get, run } from './db.ts';
import type { Coach } from './data.ts';
import { appUrl, coachInvite, coachLogin, sendMail } from './mail.ts';

const COOKIE = 'ss_admin';
const SESSION_DAYS = 14;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s !== 'change-me') return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  return 'dev-only-secret';
}
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
  const coach = get<Coach>('SELECT * FROM coaches WHERE id=?', id);
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

// naive in-memory throttle: 5 link requests / 10 min / key
const hits = new Map<string, number[]>();
function throttled(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 600_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > 5;
}

function createLoginLink(coachId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 15 * 60_000).toISOString().replace('T', ' ').slice(0, 19);
  run('INSERT INTO login_tokens (token_hash,coach_id,expires_at) VALUES (?,?,?)', sha(token), coachId, expires);
  return `${appUrl()}/admin/verify?token=${token}`;
}

/** Always behaves the same from the outside (no account enumeration). Returns the link only for the dev console. */
export async function requestLogin(email: string, ip: string): Promise<{ devLink?: string }> {
  const e = email.trim().toLowerCase();
  if (!e || throttled(`${ip}|${e}`)) return {};
  const coach = get<Coach>('SELECT * FROM coaches WHERE email=? AND active=1', e);
  if (!coach) return {};
  const link = createLoginLink(coach.id);
  const m = coachLogin(coach.name, link);
  const status = await sendMail({ ...m, to: coach.email, kind: 'coach_login' });
  return process.env.NODE_ENV !== 'production' && status === 'logged' ? { devLink: link } : {};
}

export async function inviteCoach(coach: Coach, invitedBy: string) {
  const link = createLoginLink(coach.id);
  const m = coachInvite(coach.name, invitedBy, link);
  await sendMail({ ...m, to: coach.email, kind: 'coach_invite' });
}

export function consumeLoginToken(token: string): Coach | null {
  const row = get<{ coach_id: number; expires_at: string; used: number }>('SELECT * FROM login_tokens WHERE token_hash=?', sha(token));
  if (!row || row.used) return null;
  if (new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return null;
  run('UPDATE login_tokens SET used=1 WHERE token_hash=?', sha(token));
  const coach = get<Coach>('SELECT * FROM coaches WHERE id=? AND active=1', row.coach_id);
  return coach ?? null;
}
