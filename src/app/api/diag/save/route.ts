import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { submitScreen } from '@/lib/diagnostic';
import { getLocale, tokenCookieOptions } from '@/lib/locale';
import { TOKEN_COOKIE } from '@/lib/i18n';
import { clientIp } from '@/lib/data';
import type { Answers } from '@/lib/questions';

export const dynamic = 'force-dynamic';

// light in-memory throttle on candidate creation (per IP)
const creations = new Map<string, number[]>();

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
  if (!token && body.screen === 'profile') {
    const ip = clientIp(req.headers);
    const now = Date.now();
    const recent = (creations.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 30) return NextResponse.json({ ok: false, errors: {}, fatal: 'rate_limited' }, { status: 429 });
    recent.push(now);
    creations.set(ip, recent);
  }
  const locale = await getLocale();
  const res = await submitScreen(token, body.screen, body.values, locale);
  if (!res.ok) return NextResponse.json(res, { status: res.fatal ? 409 : 422 });
  const out = NextResponse.json({ ok: true, next: res.next, completed: res.completed });
  if (res.created) out.cookies.set(TOKEN_COOKIE, res.token, tokenCookieOptions);
  return out;
}
