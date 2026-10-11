// The exchanges between a coach and a candidate (spec 2026-10-11): what the coach sends, what the candidate answers, the photo and the
// submission. Business rules return { ok: false, error } (French, shown as is); the candidate's answer is one atomic UPDATE.
import { all, get, run, tx } from './db.ts';
import { getCandidate, setStatus, type Track } from './data.ts';
import { STATUSES } from './db.ts';
import {
  COMMENT_MAX, journey, planLines, validateChoice, validateSubject,
  type ChoiceItem, type Journey, type Proposal, type ProposalKind, type ProposalResponse, type SubjectPayload,
} from './journey.ts';

export type Outcome = { ok: true } | { ok: false; error: string };
export type ProposalMailer = {
  toCandidate(candidateId: number, what: 'choix' | 'sujet' | 'photo' | 'pret'): Promise<void>;
  toCoaches(candidateId: number, what: 'choisie' | 'aucune' | 'approuvee' | 'changements' | 'photo_deposee' | 'soumise', comment: string | null): Promise<void>;
};
let mailer: ProposalMailer | null = null;
/** Tests plug a recorder; otherwise the real emails (Task 3) are loaded on first use. Mails never fail a business action. */
export const setProposalMailer = (m: ProposalMailer) => { mailer = m; };
async function getMailer(): Promise<ProposalMailer> {
  if (!mailer) {
    try { mailer = ((await import('./proposals-mailer.ts')) as { realMailer: ProposalMailer }).realMailer; } catch (e) { console.error('[proposals] could not load the mailer: emails are not sent', e); mailer = { toCandidate: async () => {}, toCoaches: async () => {} }; }
  }
  return mailer;
}
const mail = (job: (m: ProposalMailer) => Promise<void>) => getMailer().then(job).catch((e) => console.error('[proposals] mail failed', e));

type Row = Omit<Proposal, 'payload'> & { payload: string };
const toProposal = (r: Row): Proposal => ({ ...r, payload: JSON.parse(r.payload) });

export async function listProposals(candidateId: number): Promise<Proposal[]> {
  return (await all<Row>('SELECT * FROM proposals WHERE candidate_id=? ORDER BY id', candidateId)).map(toProposal);
}

export async function journeyOf(candidateId: number): Promise<Journey | null> {
  const c = await getCandidate(candidateId);
  if (!c) return null;
  return journey({ branch: c.branch, photoValidatedAt: c.photo_validated_at ?? null, submittedAt: c.submitted_at ?? null, proposals: await listProposals(candidateId) });
}

/** One pending proposal per kind: a new one replaces it; sending also closes the coach's « à traiter » on earlier answers. */
async function send(candidateId: number, coachId: number, kind: ProposalKind, payload: unknown): Promise<void> {
  await tx(async () => {
    await get('SELECT pg_advisory_xact_lock(hashtext(?))', `proposals:${candidateId}`);
    await run(`UPDATE proposals SET state='remplacee' WHERE candidate_id=? AND kind=? AND state='envoyee'`, candidateId, kind);
    await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
    await run('INSERT INTO proposals (candidate_id,kind,payload,coach_id) VALUES (?,?,?,?)', candidateId, kind, JSON.stringify(payload), coachId);
  });
}

export async function sendChoice(candidateId: number, coachId: number): Promise<Outcome> {
  const tracks = await all<Track>(`SELECT * FROM tracks WHERE candidate_id=? AND state='retenue_coach' ORDER BY position, id`, candidateId);
  const items: ChoiceItem[] = tracks.map((t) => ({ title: t.title.trim(), format: t.format ?? 'talk', pitch: (t.pitch ?? '').trim() }));
  const error = validateChoice(items);
  if (error) return { ok: false, error };
  await send(candidateId, coachId, 'choix', { items });
  mail((m) => m.toCandidate(candidateId, 'choix'));
  return { ok: true };
}

export async function sendSubject(candidateId: number, coachId: number): Promise<Outcome> {
  const s = await get<{ title: string | null; abstract: string | null; why: string | null; plan: string | null }>('SELECT title,abstract,why,plan FROM subjects WHERE candidate_id=?', candidateId);
  const payload: SubjectPayload = { title: (s?.title ?? '').trim(), abstract: (s?.abstract ?? '').trim(), why: (s?.why ?? '').trim(), plan: planLines(s?.plan ?? '') };
  const error = validateSubject(payload);
  if (error) return { ok: false, error };
  await send(candidateId, coachId, 'sujet', payload);
  mail((m) => m.toCandidate(candidateId, 'sujet'));
  return { ok: true };
}

export async function requestPhoto(candidateId: number, coachId: number, comment: string): Promise<Outcome> {
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (!c) return { ok: false, error: 'Un commentaire est nécessaire pour demander une autre photo.' };
  await run('UPDATE candidates SET photo_validated_at=NULL WHERE id=?', candidateId);
  await send(candidateId, coachId, 'photo', { comment: c });
  mail((m) => m.toCandidate(candidateId, 'photo'));
  return { ok: true };
}

export async function validatePhoto(candidateId: number, photoId: number): Promise<Outcome> {
  if (!Number.isInteger(photoId)) return { ok: false, error: 'Photo introuvable.' };
  if (!(await get('SELECT 1 FROM photos WHERE id=? AND candidate_id=?', photoId, candidateId))) return { ok: false, error: 'Photo introuvable.' };
  await tx(async () => {
    await run(`UPDATE candidates SET selected_photo_id=?, photo_validated_at=(now() at time zone 'utc') WHERE id=?`, photoId, candidateId);
    await run(`UPDATE proposals SET state='remplacee' WHERE candidate_id=? AND kind='photo' AND state='envoyee'`, candidateId);
    await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND kind='photo' AND handled_at IS NULL AND state='repondue'`, candidateId);
  });
  if ((await journeyOf(candidateId))?.step === 'soumission') mail((m) => m.toCandidate(candidateId, 'pret'));
  return { ok: true };
}

const ALLOWED: Record<ProposalKind, ProposalResponse[]> = { choix: ['choisie', 'aucune'], sujet: ['approuvee', 'changements'], photo: [] };
const NEEDS_COMMENT: ProposalResponse[] = ['aucune', 'changements'];

/** Never moves a status backwards (the order of STATUSES). */
async function advance(candidateId: number, target: string, author: string) {
  const c = await getCandidate(candidateId);
  const rank = (s: string) => STATUSES.findIndex((x) => x.id === s);
  if (c && rank(c.status) < rank(target)) await setStatus(candidateId, target, author);
}

export async function answerProposal(candidateId: number, proposalId: number, response: ProposalResponse, choice: number | null, comment: string): Promise<Outcome> {
  if (!Number.isInteger(proposalId)) return { ok: false, error: 'Proposition introuvable.' };
  const p = await get<Row>('SELECT * FROM proposals WHERE id=? AND candidate_id=?', proposalId, candidateId);
  if (!p) return { ok: false, error: 'Proposition introuvable.' };
  if (p.state === 'remplacee') return { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' };
  if (!ALLOWED[p.kind].includes(response)) return { ok: false, error: 'Réponse non valide.' };
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (NEEDS_COMMENT.includes(response) && !c) return { ok: false, error: 'Un commentaire est nécessaire.' };
  const items = p.kind === 'choix' ? (JSON.parse(p.payload) as { items: ChoiceItem[] }).items : [];
  if (response === 'choisie' && (choice === null || !Number.isInteger(choice) || choice < 0 || choice >= items.length)) return { ok: false, error: 'Choisis un des sujets proposés.' };
  const done = await tx(async () => {
    const row = await get<{ id: number }>(
      `UPDATE proposals SET state='repondue', response=?, response_choice=?, candidate_comment=?, answered_at=(now() at time zone 'utc')
       WHERE id=? AND candidate_id=? AND state='envoyee' RETURNING id`,
      response, response === 'choisie' ? choice : null, c || null, proposalId, candidateId,
    );
    if (!row) return false;
    if (response === 'choisie') {
      // the chosen topic becomes the starting point of the subject the coach develops (only when nothing is written yet)
      await run(`INSERT INTO subjects (candidate_id,title) VALUES (?,?) ON CONFLICT (candidate_id) DO UPDATE SET title=COALESCE(NULLIF(subjects.title,''), excluded.title)`, candidateId, items[choice!].title);
    }
    if (response === 'approuvee') await advance(candidateId, 'sujet_valide', 'la candidate');
    return true;
  });
  if (!done) {
    const now = await get<{ state: string }>('SELECT state FROM proposals WHERE id=? AND candidate_id=?', proposalId, candidateId);
    return { ok: false, error: now?.state === 'remplacee' ? 'Cette proposition a été remplacée : recharge la page.' : 'Tu as déjà répondu à cette proposition.' };
  }
  if (response === 'approuvee' && (await journeyOf(candidateId))?.step === 'soumission') mail((m) => m.toCandidate(candidateId, 'pret'));
  mail((m) => m.toCoaches(candidateId, response, c || null));
  return { ok: true };
}

/** A photo uploaded while the coach asked for one answers that request. */
export async function photoUploaded(candidateId: number): Promise<void> {
  const done = await get<{ id: number }>(
    `UPDATE proposals SET state='repondue', response='photo_deposee', answered_at=(now() at time zone 'utc')
     WHERE candidate_id=? AND kind='photo' AND state='envoyee' RETURNING id`, candidateId);
  if (done) mail((m) => m.toCoaches(candidateId, 'photo_deposee', null));
}

export async function confirmSubmission(candidateId: number): Promise<Outcome> {
  if ((await journeyOf(candidateId))?.step !== 'soumission') return { ok: false, error: 'La soumission n’est pas encore ouverte.' };
  const done = await tx(async () => {
    const row = await get<{ id: number }>(`UPDATE candidates SET submitted_at=(now() at time zone 'utc') WHERE id=? AND submitted_at IS NULL RETURNING id`, candidateId);
    if (!row) return false;
    await run(`UPDATE subjects SET application_state='soumise' WHERE candidate_id=?`, candidateId);
    await advance(candidateId, 'candidature_soumise', 'la candidate');
    return true;
  });
  if (!done) return { ok: false, error: 'Ta soumission est déjà confirmée.' };
  mail((m) => m.toCoaches(candidateId, 'soumise', null));
  return { ok: true };
}

export async function markHandled(candidateId: number): Promise<void> {
  await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
}
