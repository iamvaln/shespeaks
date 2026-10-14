// The exchanges between a coach and a candidate (spec 2026-10-11): what the coach sends, what the candidate answers, the photo and the
// submission. Business rules return { ok: false, error } (French, shown as is); the candidate's answer is one atomic UPDATE.
import { all, get, run, tx } from './db.ts';
import { getCandidate, setStatus, type Track } from './data.ts';
import { STATUSES } from './db.ts';
import {
  COMMENT_MAX, journey, parseIdeas, planLines, STATUS_OF_STEP, TRACKS_CLOSED_MESSAGE, tracksClosed, validateChoice, validateChoiceIdeas, validateSubject,
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

type Row = Omit<Proposal, 'payload' | 'response_data'> & { payload: string; response_data: string | null };
export const toProposal = (r: Row): Proposal => ({ ...r, payload: JSON.parse(r.payload), response_data: parseIdeas(r.response_data) });

export async function listProposals(candidateId: number): Promise<Proposal[]> {
  return (await all<Row>('SELECT * FROM proposals WHERE candidate_id=? ORDER BY id', candidateId)).map(toProposal);
}

const rank = (s: string) => STATUSES.findIndex((x) => x.id === s);
/**
 * She counts as submitted when she confirmed it here, when she answered « already submitted / already accepted » in the form, or when the
 * coach moved her status to « candidature soumise » or beyond (« non retenue » sits outside the forward path). Computed, never stored.
 * Once the coach reopened the exchanges, only her own confirmation counts again.
 */
export function countsAsSubmitted(c: { submitted_at?: string | null; reopened_at?: string | null; status: string }, applicationState: string | null | undefined): boolean {
  if (c.submitted_at) return true;
  if (c.reopened_at) return false;
  return applicationState === 'soumise' || applicationState === 'retenue'
    || (c.status !== 'non_retenue' && rank(c.status) >= rank('candidature_soumise'));
}
const applicationStateOf = async (candidateId: number) =>
  (await get<{ application_state: string | null }>('SELECT application_state FROM subjects WHERE candidate_id=?', candidateId))?.application_state ?? null;

export async function journeyOf(candidateId: number): Promise<Journey | null> {
  const c = await getCandidate(candidateId);
  if (!c) return null;
  const [state, proposals] = await Promise.all([applicationStateOf(candidateId), listProposals(candidateId)]);
  return journey({ branch: c.branch, photoValidatedAt: c.photo_validated_at ?? null, submitted: countsAsSubmitted(c, state), proposals });
}

/**
 * Why the coach cannot touch the topic (tracks, subject, AI, deletions) right now, or null:
 * - « soumise »: she counts as submitted (first: a status set by hand over a proposal still waiting leaves the way back open);
 * - « attente »: a choice or a subject was sent and waits for her answer;
 * - « approuve »: the last subject sent was approved (and the exchanges were not reopened since).
 * After « changements » or « aucune », the coach has the hand again. « Rouvrir les échanges » lifts « approuve » and « soumise ».
 */
export type ExchangeLock = 'attente' | 'approuve' | 'soumise' | null;
export function lockOf(c: { submitted_at?: string | null; reopened_at?: string | null; status: string }, applicationState: string | null | undefined, proposals: Proposal[]): ExchangeLock {
  // submitted comes first: a status set by hand over a proposal still waiting must leave « Rouvrir les échanges » (the way back) available
  if (countsAsSubmitted(c, applicationState)) return 'soumise';
  if (proposals.some((p) => p.kind !== 'photo' && p.state === 'envoyee')) return 'attente';
  const last = [...proposals].reverse().find((p) => p.kind !== 'photo' && p.state !== 'remplacee');
  if (last?.kind === 'sujet' && last.response === 'approuvee' && (!c.reopened_at || (last.answered_at ?? '') > c.reopened_at)) return 'approuve';
  return null;
}
export async function exchangeLock(candidateId: number): Promise<ExchangeLock> {
  const c = await getCandidate(candidateId);
  if (!c) return null;
  const [state, proposals] = await Promise.all([applicationStateOf(candidateId), listProposals(candidateId)]);
  return lockOf(c, state, proposals);
}
/** The server side of the read-only tracks: once she has chosen among those sent, nobody edits them (A and B) until the exchanges are reopened. */
export async function mayEditTracks(candidateId: number): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  const c = (await getCandidate(candidateId))!;
  return tracksClosed(c, await listProposals(candidateId)) ? { ok: false, error: TRACKS_CLOSED_MESSAGE } : { ok: true };
}

/**
 * Start points A and B: the subject is developed from the track she chose, so it is sent only once she has chosen one. It follows the
 * exchanges as the journey does (the latest choice or subject sent decides): after « aucune » to a second round of tracks she is back
 * at the choice, whatever she chose in the first.
 */
export const needsChoice = (branch: string | null, proposals: Proposal[]): boolean =>
  (branch === 'A' || branch === 'B') && journey({ branch, photoValidatedAt: null, submitted: false, proposals }).step === 'choix';
export const NEEDS_CHOICE = 'Envoie d’abord les pistes retenues : le sujet se développe à partir de celle qu’elle choisit.';
/** A and B: the coach keeps, edits and sends tracks; the one that becomes the subject is the one the candidate chooses. */
export const CHOOSE_AFTER_HER = 'La candidate choisit elle-même parmi les pistes que tu lui envoies : retiens-en 2 ou 3, adapte-les, puis envoie-les. « Choisir » s’active quand elle aura répondu.';
/** The server side of the greyed « Choisir » button: nobody may make a track her subject before she has chosen (A and B). */
export async function mayChooseTrack(candidateId: number): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  const c = await getCandidate(candidateId);
  return needsChoice(c?.branch ?? null, await listProposals(candidateId)) ? { ok: false, error: CHOOSE_AFTER_HER } : { ok: true };
}
/** What the coach reads when the topic is locked. */
export const LOCK_MESSAGE: Record<Exclude<ExchangeLock, null>, string> = {
  attente: 'Une proposition attend sa réponse : pistes et sujet restent verrouillés jusqu’à ce qu’elle réponde.',
  approuve: 'Elle a approuvé son sujet : pistes et sujet sont verrouillés. « Rouvrir les échanges » pour les modifier.',
  soumise: 'La candidature est soumise : pistes et sujet sont verrouillés. « Rouvrir les échanges » pour les modifier.',
};

/**
 * One pending photo request at a time: a new one replaces it. A choice or a subject is never sent over one still waiting for her
 * answer (checked under the lock, so two coaches clicking together cannot both send). Sending also closes « à traiter » on earlier answers.
 */
async function send(candidateId: number, coachId: number, kind: ProposalKind, payload: unknown): Promise<boolean> {
  return tx(async () => {
    await get('SELECT pg_advisory_xact_lock(hashtext(?))', `proposals:${candidateId}`);
    if (kind !== 'photo' && await get(`SELECT 1 FROM proposals WHERE candidate_id=? AND kind IN ('choix','sujet') AND state='envoyee'`, candidateId)) return false;
    if (kind === 'photo') await run(`UPDATE proposals SET state='remplacee' WHERE candidate_id=? AND kind='photo' AND state='envoyee'`, candidateId);
    await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
    await run('INSERT INTO proposals (candidate_id,kind,payload,coach_id) VALUES (?,?,?,?)', candidateId, kind, JSON.stringify(payload), coachId);
    return true;
  });
}
const WAITING: Outcome = { ok: false, error: LOCK_MESSAGE.attente };

/** Postgres integer ids: anything else would make the query throw instead of answering « not found ». */
const validId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 2147483647;
const NO_CANDIDATE: Outcome = { ok: false, error: 'Candidate introuvable' };
/** An unknown candidate is answered with a message, never a foreign-key error. */
const candidateExists = async (id: unknown): Promise<boolean> => validId(id) && !!(await get('SELECT 1 FROM candidates WHERE id=?', id));
const ALREADY_SUBMITTED: Outcome = { ok: false, error: 'La candidature est déjà soumise.' };
/** Nothing more is sent once she counts as submitted: it could never be answered. */
const isSubmitted = async (id: number): Promise<boolean> => (await journeyOf(id))?.step === 'soumise';

export async function sendChoice(candidateId: number, coachId: number): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  const lock = await exchangeLock(candidateId);
  if (lock === 'soumise') return ALREADY_SUBMITTED;
  if (lock) return { ok: false, error: LOCK_MESSAGE[lock] };
  const closed = await mayEditTracks(candidateId); // she already chose among the tracks sent: another series only after « Rouvrir les échanges »
  if (!closed.ok) return closed;
  const tracks = await all<Track>(`SELECT * FROM tracks WHERE candidate_id=? AND state='retenue_coach' ORDER BY position, id`, candidateId);
  const items: ChoiceItem[] = tracks.map((t) => ({ title: t.title.trim(), format: t.format ?? 'talk', pitch: (t.pitch ?? '').trim() }));
  const error = validateChoice(items);
  if (error) return { ok: false, error };
  if (!(await send(candidateId, coachId, 'choix', { items }))) return WAITING;
  mail((m) => m.toCandidate(candidateId, 'choix'));
  await stepBackQuietly(candidateId, () => coachName(coachId));
  return { ok: true };
}

export async function sendSubject(candidateId: number, coachId: number): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  const lock = await exchangeLock(candidateId);
  if (lock === 'soumise') return ALREADY_SUBMITTED;
  if (lock) return { ok: false, error: LOCK_MESSAGE[lock] };
  const c = await getCandidate(candidateId);
  if (needsChoice(c?.branch ?? null, await listProposals(candidateId))) return { ok: false, error: NEEDS_CHOICE };
  const s = await get<{ title: string | null; abstract: string | null; why: string | null; plan: string | null }>('SELECT title,abstract,why,plan FROM subjects WHERE candidate_id=?', candidateId);
  const payload: SubjectPayload = { title: (s?.title ?? '').trim(), abstract: (s?.abstract ?? '').trim(), why: (s?.why ?? '').trim(), plan: planLines(s?.plan ?? '') };
  const error = validateSubject(payload);
  if (error) return { ok: false, error };
  if (!(await send(candidateId, coachId, 'sujet', payload))) return WAITING;
  mail((m) => m.toCandidate(candidateId, 'sujet'));
  await stepBackQuietly(candidateId, () => coachName(coachId));
  return { ok: true };
}

export async function requestPhoto(candidateId: number, coachId: number, comment: string): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  if (await isSubmitted(candidateId)) return ALREADY_SUBMITTED;
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (!c) return { ok: false, error: 'Un commentaire est nécessaire pour demander une autre photo.' };
  await run('UPDATE candidates SET photo_validated_at=NULL WHERE id=?', candidateId);
  await send(candidateId, coachId, 'photo', { comment: c });
  mail((m) => m.toCandidate(candidateId, 'photo'));
  return { ok: true };
}

export async function validatePhoto(candidateId: number, photoId: number): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  if (!validId(photoId)) return { ok: false, error: 'Photo introuvable.' };
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
  if (c && rank(c.status) < rank(target)) await setStatus(candidateId, target, author);
}

/**
 * The exchanges go back (reopened, or a new proposal sent over an approved subject): « Sujet validé » and « Candidature soumise » follow them
 * back, as they followed them forward (advance). « Retenue » and what comes after say what happened at the event: never touched here.
 */
async function stepBack(candidateId: number, author: string) {
  const [c, j] = await Promise.all([getCandidate(candidateId), journeyOf(candidateId)]);
  if (!c || !j || (c.status !== 'sujet_valide' && c.status !== 'candidature_soumise')) return;
  const target = STATUS_OF_STEP[j.step];
  if (rank(target) < rank(c.status)) await setStatus(candidateId, target, author);
}
/** After the proposal is stored and the mail queued: a failure here must neither lose the mail nor turn a stored proposal into an error page. */
async function stepBackQuietly(candidateId: number, author: () => Promise<string> | string) {
  try { await stepBack(candidateId, await author()); } catch (e) { console.error('[proposals] status step-back failed', { candidateId, error: e instanceof Error ? e.message : String(e) }); }
}
const coachName = async (coachId: number): Promise<string> => (await get<{ name: string }>('SELECT name FROM coaches WHERE id=?', coachId))?.name ?? 'coach';

/** `ideas`: what she imagines for the track she chooses (required with « choisie », ignored otherwise). */
export async function answerProposal(candidateId: number, proposalId: number, response: ProposalResponse, choice: number | null, comment: string, ideas?: unknown): Promise<Outcome> {
  if (!validId(proposalId)) return { ok: false, error: 'Proposition introuvable.' };
  const p = await get<Row>('SELECT * FROM proposals WHERE id=? AND candidate_id=?', proposalId, candidateId);
  if (!p) return { ok: false, error: 'Proposition introuvable.' };
  if (p.state === 'remplacee') return { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' };
  if (!ALLOWED[p.kind].includes(response)) return { ok: false, error: 'Réponse non valide.' };
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (NEEDS_COMMENT.includes(response) && !c) return { ok: false, error: 'Un commentaire est nécessaire.' };
  const items = p.kind === 'choix' ? (JSON.parse(p.payload) as { items: ChoiceItem[] }).items : [];
  if (response === 'choisie' && (choice === null || !Number.isInteger(choice) || choice < 0 || choice >= items.length)) return { ok: false, error: 'Choisis un des sujets proposés.' };
  const checked = response === 'choisie' ? validateChoiceIdeas(ideas) : null;
  if (checked && !checked.ok) return { ok: false, error: checked.error };
  const data = checked?.ok ? JSON.stringify(checked.value) : null;
  const done = await tx(async () => {
    const row = await get<{ id: number }>(
      `UPDATE proposals SET state='repondue', response=?, response_choice=?, candidate_comment=?, response_data=?, answered_at=(now() at time zone 'utc')
       WHERE id=? AND candidate_id=? AND state='envoyee' RETURNING id`,
      response, response === 'choisie' ? choice : null, c || null, data, proposalId, candidateId,
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
  // answering a request, or her first photo at the photo step (nothing asked yet): either way the coach has a photo to look at
  if (done || (await journeyOf(candidateId))?.step === 'photo') mail((m) => m.toCoaches(candidateId, 'photo_deposee', null));
}

export async function confirmSubmission(candidateId: number): Promise<Outcome> {
  const step = (await journeyOf(candidateId))?.step;
  if (step === 'soumise') return { ok: false, error: 'Ta soumission est déjà confirmée.' };
  if (step !== 'soumission') return { ok: false, error: 'La soumission n’est pas encore ouverte.' };
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

/** « Rouvrir les échanges »: the coach can send again; her space shows the step the proposals lead to, and she confirms her submission again at the end. */
export async function reopenExchanges(candidateId: number, author = 'système'): Promise<Outcome> {
  if (!(await candidateExists(candidateId))) return NO_CANDIDATE;
  const lock = await exchangeLock(candidateId);
  if (lock === 'attente') return WAITING;
  // the exchanges are open only when nothing locks the topic and the tracks she chose among are not closed either
  if (!lock && (await mayEditTracks(candidateId)).ok) return { ok: false, error: 'Les échanges sont déjà ouverts.' };
  await run(`UPDATE candidates SET submitted_at=NULL, reopened_at=(now() at time zone 'utc') WHERE id=?`, candidateId);
  await stepBackQuietly(candidateId, () => author);
  return { ok: true };
}

export async function markHandled(candidateId: number): Promise<void> {
  if (!validId(candidateId)) return;
  await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
}
