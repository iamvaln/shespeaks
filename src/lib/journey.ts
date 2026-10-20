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
  /** What she imagines for the track she chose (« choisie » only). */
  response_data: ChoiceIdeas | null;
  coach_id: number | null;
  sent_at: string;
  answered_at: string | null;
  handled_at: string | null;
  reminded_at: string | null;
}
export type Step = 'choix' | 'sujet' | 'photo' | 'soumission' | 'soumise';
export type Journey = { step: Step; steps: Step[]; waiting: 'coach' | 'candidate' | 'none'; pending: Proposal | null };

/** The status each step of the exchanges stands for: the statuses the exchanges drive (« Intérêt reçu », « Sujet validé », « Candidature soumise »). */
export const STATUS_OF_STEP: Record<Step, string> = { choix: 'diagnostic_recu', sujet: 'diagnostic_recu', photo: 'sujet_valide', soumission: 'sujet_valide', soumise: 'candidature_soumise' };

export const COMMENT_MAX = 1000;

/**
 * A and B: once she has chosen among the tracks sent, that series is closed. The tracks are then for consultation only (the coach can no
 * longer edit them nor send another series) until she reopens the exchanges. A later answer « none fits » leaves the hand to the coach, who
 * prepares the next series; a series chosen after the reopening closes it again. The proposals are in the order they were sent.
 */
export const TRACKS_CLOSED_MESSAGE = 'Elle a choisi parmi les pistes envoyées : elles ne sont plus modifiables. « Rouvrir les échanges » pour lui en envoyer d’autres.';
export function tracksClosed(c: { branch: Branch | null; reopened_at?: string | null }, proposals: Proposal[]): boolean {
  if (c.branch !== 'A' && c.branch !== 'B') return false;
  const last = [...proposals].reverse().find((p) => p.kind === 'choix' && p.state !== 'remplacee');
  if (last?.state !== 'repondue' || last.response !== 'choisie') return false;
  return !c.reopened_at || (last.answered_at ?? '') > c.reopened_at;
}

/**
 * Asked in the same form as her choice, so she has little to do: how she would approach the topic (at least one), what she could
 * show or tell, the one thing to remember, what to prepare. Easier than « a plan »; the coach builds the plan from it.
 */
export const APPROACHES = ['experience', 'demo', 'pas_a_pas', 'erreurs', 'conseils'] as const;
export type Approach = (typeof APPROACHES)[number];
export type ChoiceIdeas = { approach: Approach[]; other: string; concrete: string; takeaway: string; prepare: string };
export const IDEA_MAX = 600;
/** For the coach (fiche, emails, AI prompt): the approaches in French. */
export const APPROACH_LABEL: Record<Approach, string> = {
  experience: 'raconter son expérience', demo: 'montrer une démo en direct', pas_a_pas: 'expliquer pas à pas',
  erreurs: 'partager ses erreurs et ce qu’elle en a appris', conseils: 'donner des conseils pratiques',
};
const ideaText = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');
export function validateChoiceIdeas(input: unknown): { ok: true; value: ChoiceIdeas } | { ok: false; error: string } {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const approach = Array.isArray(o.approach) ? [...new Set(o.approach.filter((x): x is Approach => (APPROACHES as readonly string[]).includes(x as string)))] : [];
  const value: ChoiceIdeas = { approach, other: ideaText(o.other), concrete: ideaText(o.concrete), takeaway: ideaText(o.takeaway), prepare: ideaText(o.prepare) };
  if (!value.approach.length && !value.other) return { ok: false, error: 'Dis-nous comment tu aimerais aborder ce sujet (au moins une case, ou en quelques mots).' };
  if ([value.other, value.concrete, value.takeaway, value.prepare].some((x) => x.length > IDEA_MAX)) return { ok: false, error: `Une réponse est trop longue (${IDEA_MAX} caractères au maximum).` };
  return { ok: true, value };
}
/** A stored JSON answer -> ideas, or null (absent or unreadable). */
export function parseIdeas(raw: string | null | undefined): ChoiceIdeas | null {
  if (!raw) return null;
  try { const v = validateChoiceIdeas(JSON.parse(raw)); return v.ok ? v.value : null; } catch { return null; }
}
/** Her ideas as lines for the coach: « Approche : … », « Concret : … »… (empty answers left out). */
export function ideaLines(i: ChoiceIdeas): string[] {
  const approach = [...i.approach.map((a) => APPROACH_LABEL[a]), i.other].filter(Boolean).join(' ; ');
  return [
    approach && `Comment l’aborder : ${approach}`,
    i.concrete && `Ce qu’elle pourrait montrer ou raconter : ${i.concrete}`,
    i.takeaway && `Ce que le public doit retenir : ${i.takeaway}`,
    i.prepare && `Ce qu’il faut préparer selon elle : ${i.prepare}`,
  ].filter((x): x is string => !!x);
}
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

/**
 * What a coach reads about a candidate, in the list and on her fiche alike: where the exchanges stand and who has the hand. The coach's own
 * status (« Intérêt reçu », « Sujet validé »…) says nothing about what was already sent to her: « Intérêt reçu » covers a candidate nobody
 * has written to yet as well as one who was sent her tracks, or her subject.
 */
export type JourneyState = { label: string; waiting: Journey['waiting'] };
export function journeyState(j: Journey, proposals: Proposal[], photoCount = 1): JourneyState {
  const { waiting } = j;
  // a photo asked for before the photo step (the Photos tab offers it at any time) is no « Rien envoyé »: something was sent to her
  const photoAsked = latest(proposals, 'photo')?.state === 'envoyee' ? ' · photo demandée' : '';
  switch (j.step) {
    case 'soumise': return { label: 'Candidature soumise', waiting };
    case 'soumission': return { label: 'Attend sa soumission', waiting };
    // nothing to review while she has sent no photo: the coach has to ask for one
    case 'photo': return { label: j.pending ? 'Photo demandée' : photoCount > 0 ? 'Sujet approuvé · photo à traiter' : 'Sujet approuvé · photo à demander', waiting };
    case 'choix':
      if (j.pending) return { label: `Pistes proposées${photoAsked}`, waiting };
      return { label: `${latest(proposals, 'choix')?.response === 'aucune' ? 'Aucune piste ne lui convient' : 'Rien envoyé'}${photoAsked}`, waiting };
    case 'sujet': {
      if (j.pending) return { label: `Sujet proposé${photoAsked}`, waiting };
      // « changements » is the latest word only while no newer track was chosen since (a new round of tracks starts over)
      const subject = latest(proposals, 'sujet'), choice = latest(proposals, 'choix');
      if (subject?.response === 'changements' && (!choice || subject.id > choice.id)) return { label: `Changements demandés sur le sujet${photoAsked}`, waiting };
      return { label: `${j.steps[0] === 'choix' ? 'A choisi · sujet à proposer' : 'Rien envoyé'}${photoAsked}`, waiting };
    }
  }
}
/** Said aloud for screen readers (the colour of the line says it for the eye). */
export const WAITING_SR: Record<Journey['waiting'], string> = { coach: 'à traiter', candidate: 'en attente de sa réponse', none: 'terminé' };

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
