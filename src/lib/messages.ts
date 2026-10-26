// Conversations between the coach and the candidate outside the proposals' buttons (migration 0017): a reply under one exchange, or a
// message on its own. Each message is emailed to the other side; a candidate's message waits for the coach until she answers or marks it.
import { all, get, run } from './db.ts';
import { getCandidate } from './data.ts';
import { coachRecipients } from './diagnostic.ts';
import { appUrl, candidateCoachMessage, coachCandidateMessage, sendMail } from './mail.ts';
import { hit, rateKey } from './ratelimit.ts';

export const MESSAGE_MAX = 2000;
/** A candidate writes at most this many messages an hour (each one emails the coaches). */
export const MESSAGES_PER_HOUR = 10;

export type Message = { id: number; candidate_id: number; proposal_id: number | null; author: 'coach' | 'candidate'; coach_id: number | null; body: string; created_at: string; handled_at: string | null };
export type MessageOutcome = { ok: true } | { ok: false; error: string };

export const listMessages = (candidateId: number) => all<Message>('SELECT * FROM messages WHERE candidate_id=? ORDER BY id', candidateId);
/** The messages of one exchange (`proposalId`), or those on their own (null), oldest first. */
export const threadOf = (messages: Message[], proposalId: number | null) => messages.filter((m) => m.proposal_id === proposalId);

const validId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 2147483647;
const KIND_LABEL: Record<string, string> = { choix: 'le choix de sujets', sujet: 'le sujet proposé', photo: 'la photo demandée' };

/**
 * One message, from the coach or from the candidate, under one of HER exchanges or on its own. The text is required and capped; a
 * candidate is rate limited. The coach's message closes « à traiter » on the candidate's messages of the same conversation (that
 * exchange, or the messages on their own). The other side is emailed.
 */
export async function postMessage(i: { candidateId: number; author: 'coach' | 'candidate'; coachId?: number | null; proposalId?: number | null; body: unknown }): Promise<MessageOutcome> {
  if (!validId(i.candidateId)) return { ok: false, error: 'Candidate introuvable' };
  const c = await getCandidate(i.candidateId);
  if (!c) return { ok: false, error: 'Candidate introuvable' };
  const body = typeof i.body === 'string' ? i.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!body) return { ok: false, error: i.author === 'coach' ? 'Écris un message.' : 'Écris ton message.' };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Message trop long (${MESSAGE_MAX} caractères au maximum).` };
  const proposalId = i.proposalId ?? null;
  let about: string | null = null;
  if (proposalId !== null) {
    if (!validId(proposalId)) return { ok: false, error: 'Échange introuvable.' };
    const p = await get<{ kind: string }>('SELECT kind FROM proposals WHERE id=? AND candidate_id=?', proposalId, c.id);
    if (!p) return { ok: false, error: 'Échange introuvable.' };
    about = KIND_LABEL[p.kind] ?? null;
  }
  if (i.author === 'candidate') {
    const rate = await hit({ bucket: 'message:candidate', key: rateKey(String(c.id)), max: MESSAGES_PER_HOUR, windowSec: 3600 });
    if (!rate.ok) return { ok: false, error: 'Beaucoup de messages en peu de temps : réessaie dans un moment.' };
  }
  await run('INSERT INTO messages (candidate_id, proposal_id, author, coach_id, body) VALUES (?,?,?,?,?)', c.id, proposalId, i.author, i.author === 'coach' ? i.coachId ?? null : null, body);
  if (i.author === 'coach') {
    await run(`UPDATE messages SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND author='candidate' AND handled_at IS NULL
      AND proposal_id IS NOT DISTINCT FROM ?::int`, c.id, proposalId);
    if (c.email) {
      const m = candidateCoachMessage(c.name ?? '', `${appUrl()}/reprendre/${c.token}`, c.locale, body);
      await sendMail({ ...m, to: c.email, kind: 'candidate_message', candidateId: c.id });
    }
  } else {
    const m = coachCandidateMessage({ name: c.name ?? '' }, body, `${appUrl()}/admin/candidates/${c.id}`, about);
    await Promise.allSettled((await coachRecipients(c)).map((r) => sendMail({ ...m, to: r.email, kind: 'coach_message', candidateId: c.id })));
  }
  return { ok: true };
}

/** « Marquer comme traité » covers her messages too. */
export async function markMessagesHandled(candidateId: number): Promise<void> {
  if (!validId(candidateId)) return;
  await run(`UPDATE messages SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND author='candidate' AND handled_at IS NULL`, candidateId);
}
