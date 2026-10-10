import { NextResponse, type NextRequest } from 'next/server';
import { decide, WAITING_PAGE } from './redirect.ts';

export function middleware(req: NextRequest) {
  const d = decide(req.headers.get('host'), req.nextUrl.pathname, req.nextUrl.search, req.cookies.get('ss_token')?.value);
  if (d.kind === 'waiting') {
    return new NextResponse(WAITING_PAGE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30' } });
  }
  return NextResponse.redirect(d.url, d.status);
}
export const config = { matcher: '/:path*' };
