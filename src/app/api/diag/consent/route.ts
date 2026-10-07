import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { run } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const { consent } = (await req.json().catch(() => ({}))) as { consent?: boolean };
  await run('UPDATE candidates SET consent_photo=? WHERE id=?', consent ? 1 : 0, c.id);
  return NextResponse.json({ ok: true });
}
