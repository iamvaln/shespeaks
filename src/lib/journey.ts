// Where a candidate stands in the exchanges with her coach (spec 2026-10-11 « parcours de propositions »). Pure: the step is always
// computed from the proposals log, the photo validation and a « submitted » marker, never stored, so it cannot drift.
import type { Branch } from './questions.ts';

export type ProposalKind = 'choix' | 'sujet' | 'photo';
export type ProposalState = 'envoyee' | 'repondue' | 'remplacee';
export type ProposalResponse = 'choisie' | 'aucune' | 'approuvee' | 'changements' | 'photo_deposee';
export type ChoiceItem = { title: string; format: string; pitch: string };
export type ChoicePayload = { items: ChoiceItem[] };
export type SubjectPayload = { title: string; abstract: string; why: string; plan: string[] };
export type PhotoPayload = { comment: string };
export interface Proposal {
  id: number;
  candidate_id: number;
  kind: ProposalKind;
  payload: ChoicePayload | SubjectPayload | PhotoPayload;
  state: ProposalState;
  response: ProposalResponse | null;
  response_choice: number | null;
  candidate_comment: string | null;
  coach_id: number | null;
  sent_at: string;
  answered_at: string | null;
  handled_at: string | null;
  reminded_at: string | null;
}
export type Step = 'choix' | 'sujet' | 'photo' | 'soumission' | 'soumise';
export type Journey = { step: Step; steps: Step[]; waiting: 'coach' | 'candidate' | 'none'; pending: Proposal | null };

export const COMMENT_MAX = 1000;
const PLAN_MAX = 8;
const STEP_MAX = 300;

export function journeySteps(branch: Branch | null): Step[] {
  return branch === 'A' || branch === 'B' ? ['choix', 'sujet', 'photo', 'soumission', 'soumise'] : ['sujet', 'photo', 'soumission', 'soumise'];
}

/** The latest proposal of the given kinds that was not replaced (the log is ordered by id). */
const latest = (ps: Proposal[], ...kinds: ProposalKind[]) =>
  [...ps].filter((x) => kinds.includes(x.kind) && x.state !== 'remplacee').sort((a, b) => a.id - b.id).at(-1) ?? null;

/**
 * `submitted` is true as soon as she counts as submitted, whatever the reason (her confirmation, « already submitted » in the form, or a
 * status the coach moved forward): nothing is pending then.
 */
export function journey(i: { branch: Branch | null; photoValidatedAt: string | null; submitted: boolean; proposals: Proposal[] }): Journey {
  const steps = journeySteps(i.branch);
  const at = (step: Step, last: Proposal | null): Journey => {
    const pending = last?.state === 'envoyee' ? last : null;
    return { step, steps, waiting: pending ? 'candidate' : 'coach', pending };
  };
  if (i.submitted) return { step: 'soumise', steps, waiting: 'none', pending: null };
  // A and B: whichever of choice and subject was sent last decides, so the proposal she was emailed is the one she can answer
  if (steps[0] === 'choix') {
    const last = latest(i.proposals, 'choix', 'sujet');
    if (!last) return at('choix', null);
    if (last.kind === 'choix') return last.response === 'choisie' ? at('sujet', null) : at('choix', last);
  }
  const subject = latest(i.proposals, 'sujet');
  if (subject?.response === 'approuvee') {
    if (i.photoValidatedAt) return { step: 'soumission', steps, waiting: 'candidate', pending: null };
    return at('photo', latest(i.proposals, 'photo'));
  }
  return at('sujet', subject);
}

export function validateChoice(items: ChoiceItem[]): string | null {
  if (items.length < 2 || items.length > 3) return 'Il faut 2 ou 3 pistes retenues pour envoyer un choix.';
  if (items.some((x) => !x.title.trim() || x.title.length > 140)) return 'Chaque piste retenue doit avoir un titre (140 caractères au plus).';
  if (items.some((x) => !x.pitch.trim() || x.pitch.length > 400)) return 'Chaque piste retenue doit avoir sa phrase pour la candidate (400 caractères au plus).';
  return null;
}

/**
 * The sentence « for the candidate » is written only by « Enregistrer »: the other buttons of a track (Choisir, Retenir, Écarter, Rétablir)
 * submit the same form, whose field may still hold the AI hook shown as a starting point, never meant to be sent unread.
 * undefined = leave the stored sentence as it is.
 */
export function pitchToSave(op: string, typed: string | null): string | null | undefined {
  if (op !== 'save' || typed === null) return undefined;
  return typed.trim().slice(0, 400) || null;
}

export function validateSubject(p: SubjectPayload): string | null {
  if (!p.title.trim()) return 'Le sujet doit avoir un titre avant l’envoi.';
  if (!p.abstract.trim()) return 'Le sujet doit avoir un résumé avant l’envoi.';
  if (p.why.length > 1500) return '« Pourquoi ces changements » : 1500 caractères au plus.';
  return null;
}

/** « Comment t'y prendre » as typed by the coach: one step per line, blank lines dropped, at most 8 steps of 300 characters. */
export const planLines = (text: string): string[] =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.slice(0, STEP_MAX)).slice(0, PLAN_MAX);
