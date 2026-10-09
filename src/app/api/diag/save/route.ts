import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { submitScreen } from '@/lib/diagnostic';
import { getLocale, tokenCookieOptions } from '@/lib/locale';
import { TOKEN_COOKIE } from '@/lib/i18n';
import { checkCreateIp, requestIp } from '@/lib/ratelimit';
import { getCandidateByToken } from '@/lib/data';
import type { Answers } from '@/lib/questions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { screen?: string; values?: Answers };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errors: {}, fatal: 'bad_request' }, { status: 400 });
  }
  if (!body.screen || typeof body.values !== 'object' || body.values === null) {
    return NextResponse.json({ ok: false, errors: {}, fatal: 'bad_request' }, { status: 400 });
  }
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value ?? null;
  // Starting the form (no cookie, or a cookie that matches nobody: a made-up one must not skip the limit). Counted in the
  // database so the limit holds across serverless instances.
  if (body.screen === 'profile' && !(token && (await getCandidateByToken(token)))) {
    const r = await checkCreateIp(requestIp(req.headers));
    if (!r.ok) return NextResponse.json({ ok: false, errors: {}, fatal: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } });
  }
  const locale = await getLocale();
  const res = await submitScreen(token, body.screen, body.values, locale);
  if (!res.ok) return NextResponse.json(res, { status: res.fatal === 'rate_limited' || res.fatal === 'email_rate_limited' ? 429 : res.fatal ? 409 : 422 });
  const out = NextResponse.json({ ok: true, next: res.next, completed: res.completed });
  if (res.created) out.cookies.set(TOKEN_COOKIE, res.token, tokenCookieOptions);
  return out;
}
