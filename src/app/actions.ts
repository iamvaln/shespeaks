'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LANG_COOKIE, TOKEN_COOKIE } from '@/lib/i18n';
import { getCandidateByToken } from '@/lib/data';
import { run } from '@/lib/db';

export async function setLocaleAction(locale: string) {
  if (locale !== 'fr' && locale !== 'en') return;
  const jar = await cookies();
  jar.set(LANG_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const token = jar.get(TOKEN_COOKIE)?.value;
  const c = token ? await getCandidateByToken(token) : undefined;
  if (c) await run('UPDATE candidates SET locale=? WHERE id=?', locale, c.id);
  revalidatePath('/', 'layout');
}
