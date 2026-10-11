import { NextResponse } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { confirmSubmission } from '@/lib/proposals';

export const dynamic = 'force-dynamic';

export async function POST() {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const r = await confirmSubmission(c.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
}
