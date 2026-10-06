// Server-side locale + candidate-cookie helpers.
import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, TOKEN_COOKIE } from './i18n.ts';
import type { Locale } from './questions.ts';
import { getCandidateByToken, type Candidate } from './data.ts';

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c === 'fr' || c === 'en') return c;
  const al = (await headers()).get('accept-language') ?? '';
  return /^\s*en/i.test(al) ? 'en' : 'fr';
}

export async function getCandidateFromCookie(): Promise<Candidate | undefined> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return token ? getCandidateByToken(token) : undefined;
}

export const tokenCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 180,
};
