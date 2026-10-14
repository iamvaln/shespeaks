import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateByToken } from '@/lib/data';
import { healStuck } from '@/lib/diagnostic';
import { TOKEN_COOKIE } from '@/lib/i18n';
import { tokenCookieOptions } from '@/lib/locale';

export const dynamic = 'force-dynamic';

// Personal resume link (sent by email): restores the session cookie on any device, then goes to the right place.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const found = await getCandidateByToken(token);
  const c = found ? await healStuck(found) : undefined; // a dossier left without its end date is finished before choosing where to go
  const base = process.env.APP_URL || req.nextUrl.origin;
  if (!c) return NextResponse.redirect(new URL('/', base));
  const res = NextResponse.redirect(new URL(c.completed_at ? '/plan' : '/interet', base));
  res.cookies.set(TOKEN_COOKIE, token, tokenCookieOptions);
  return res;
}
