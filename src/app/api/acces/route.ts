import { NextResponse, type NextRequest } from 'next/server';
import { requestAccess } from '@/lib/access';
import { requestIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const r = await requestAccess(typeof email === 'string' ? email : '', requestIp(req.headers));
  if (r.retryAfterSec) return NextResponse.json({ retryAfter: r.retryAfterSec }, { status: 429, headers: { 'retry-after': String(r.retryAfterSec) } });
  return NextResponse.json({ ok: true });
}
