import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { MESSAGE_MAX, postMessage } from '@/lib/messages';

export const dynamic = 'force-dynamic';
const refuse = (error: string) => NextResponse.json({ error }, { status: 409 });

/** The candidate writes to her coach, under one of her exchanges (`proposalId`) or on its own (null). */
export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { proposalId?: unknown; body?: unknown } | null;
  if (!b || typeof b !== 'object' || typeof b.body !== 'string') return refuse('Message non valide.');
  if (b.body.length > MESSAGE_MAX * 2) return refuse(`Message trop long (${MESSAGE_MAX} caractères au maximum).`);
  if (b.proposalId !== undefined && b.proposalId !== null && (typeof b.proposalId !== 'number' || !Number.isInteger(b.proposalId))) return refuse('Échange introuvable.');
  const r = await postMessage({ candidateId: c.id, author: 'candidate', proposalId: (b.proposalId as number | null | undefined) ?? null, body: b.body });
  return r.ok ? NextResponse.json({ ok: true }) : refuse(r.error);
}
