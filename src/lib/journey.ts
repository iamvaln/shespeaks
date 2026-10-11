// Where a candidate stands in the exchanges with her coach (spec 2026-10-11 « parcours de propositions »). Pure: the step is always
// computed from the proposals log and two dates, never stored, so it cannot drift.
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

/** The latest proposal of a kind that was not replaced (the log is ordered by id). */
const latest = (ps: Proposal[], kind: ProposalKind) => [...ps].filter((x) => x.kind === kind && x.state !== 'remplacee').sort((a, b) => a.id - b.id).at(-1) ?? null;

export function journey(i: { branch: Branch | null; photoValidatedAt: string | null; submittedAt: string | null; proposals: Proposal[] }): Journey {
  const steps = journeySteps(i.branch);
  const at = (step: Step, last: Proposal | null): Journey => {
    const pending = last?.state === 'envoyee' ? last : null;
    return { step, steps, waiting: pending ? 'candidate' : 'coach', pending };
  };
  if (i.submittedAt) return { step: 'soumise', steps, waiting: 'none', pending: null };
  const subject = latest(i.proposals, 'sujet');
  if (subject?.response === 'approuvee') {
    if (i.photoValidatedAt) return { step: 'soumission', steps, waiting: 'candidate', pending: null };
    return at('photo', latest(i.proposals, 'photo'));
  }
  const choice = latest(i.proposals, 'choix');
  if (steps[0] === 'choix' && !subject && choice?.response !== 'choisie') return at('choix', choice);
  return at('sujet', subject);
}

export function validateChoice(items: ChoiceItem[]): string | null {
  if (items.length < 2 || items.length > 3) return 'Il faut 2 ou 3 pistes retenues pour envoyer un choix.';
  if (items.some((x) => !x.title.trim() || x.title.length > 140)) return 'Chaque piste retenue doit avoir un titre (140 caractères au plus).';
  if (items.some((x) => !x.pitch.trim() || x.pitch.length > 400)) return 'Chaque piste retenue doit avoir sa phrase pour la candidate (400 caractères au plus).';
  return null;
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
