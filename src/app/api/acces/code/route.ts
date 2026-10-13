import { NextResponse, type NextRequest } from 'next/server';
import { verifyCode } from '@/lib/resume-code';
import { requestIp } from '@/lib/ratelimit';
import { TOKEN_COOKIE } from '@/lib/i18n';
import { tokenCookieOptions } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/** « Reprendre avec un code »: the code she received by email opens her journey in this browser. */
export async function POST(req: NextRequest) {
  const { email, code } = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const r = await verifyCode(typeof email === 'string' ? email.slice(0, 254) : '', typeof code === 'string' ? code.slice(0, 20) : '', requestIp(req.headers));
  if ('retryAfterSec' in r) return NextResponse.json({ ok: false, retryAfter: r.retryAfterSec }, { status: 429, headers: { 'retry-after': String(r.retryAfterSec) } });
  if ('wrong' in r) return NextResponse.json({ ok: false }, { status: 400 });
  const res = NextResponse.json({ ok: true, next: r.completed ? '/plan' : '/interet' });
  res.cookies.set(TOKEN_COOKIE, r.token, tokenCookieOptions);
  return res;
}
