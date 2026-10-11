import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { answerProposal } from '@/lib/proposals';
import { COMMENT_MAX, type ProposalResponse } from '@/lib/journey';

export const dynamic = 'force-dynamic';
const RESPONSES = ['choisie', 'aucune', 'approuvee', 'changements'];
const refuse = (error: string) => NextResponse.json({ error }, { status: 409 });

export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { proposalId?: unknown; response?: unknown; choice?: unknown; comment?: unknown } | null;
  if (!b || typeof b !== 'object') return refuse('Réponse non valide.');
  // never trust the client: types and lengths are checked here, business rules in answerProposal
  if (typeof b.response !== 'string' || !RESPONSES.includes(b.response)) return refuse('Réponse non valide.');
  if (typeof b.proposalId !== 'number' || !Number.isInteger(b.proposalId)) return refuse('Proposition introuvable.');
  if (b.choice !== undefined && b.choice !== null && (typeof b.choice !== 'number' || !Number.isInteger(b.choice))) return refuse('Choisis un des sujets proposés.');
  if (b.comment !== undefined && b.comment !== null && typeof b.comment !== 'string') return refuse('Commentaire non valide.');
  const comment = (b.comment as string | undefined | null) ?? '';
  if (comment.length > COMMENT_MAX) return refuse(`Commentaire trop long (${COMMENT_MAX} caractères au maximum).`);
  const r = await answerProposal(c.id, b.proposalId, b.response as ProposalResponse, (b.choice as number | undefined | null) ?? null, comment);
  return r.ok ? NextResponse.json({ ok: true }) : refuse(r.error);
}
