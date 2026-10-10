import { NextResponse, type NextRequest } from 'next/server';
import { redirectTarget } from './redirect.ts';

export function middleware(req: NextRequest) {
  const { url, status } = redirectTarget(req.nextUrl.pathname, req.nextUrl.search, req.cookies.get('ss_token')?.value);
  return NextResponse.redirect(url, status);
}
export const config = { matcher: '/:path*' };
