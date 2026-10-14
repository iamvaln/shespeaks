// What the coach may set in « Suivi »: the statuses that are ahead. A status that is behind is gone from the list (the exchanges drive the
// first ones, and « Rouvrir les échanges » is the way back); « non retenue » is an exit that stays available, and can be taken back.
import { STATUSES, statusLabel } from './db.ts';
import { getCandidate, getSubject } from './data.ts';
import { STATUS_OF_STEP } from './journey.ts';
import { exchangeLock, journeyOf } from './proposals.ts';

/** The forward path of a candidacy; « non retenue » sits outside it. */
export const STATUS_PATH: readonly string[] = ['en_cours', 'diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'slides_validees', 'repetition_faite', 'jour_j'];
const rank = (s: string) => STATUS_PATH.indexOf(s);
/** The two statuses the exchanges drive (with « Intérêt reçu » at the start): the only ones that can be ahead of what the exchanges say. */
const DRIVEN = ['sujet_valide', 'candidature_soumise'];

/**
 * The statuses offered for a candidate now at `current` (always including it), in the order of STATUSES.
 * `floor` is the status the exchanges stand for (STATUS_OF_STEP of her step): a hand-set « Sujet validé » over an exchange that has not
 * got there can always be brought back to it, so the status can be put in sync again.
 */
export function statusChoices(current: string, formDone: boolean, floor: string | null = null): string[] {
  let ids: readonly string[];
  if (current === 'non_retenue') ids = [formDone ? 'diagnostic_recu' : 'en_cours', 'non_retenue']; // a « non retenue » set by mistake can be taken back, to where she was
  else if (current === 'en_cours' && !formDone) ids = ['en_cours', 'non_retenue']; // the app moves her on when she finishes the form
  else {
    const i = rank(current);
    ids = i < 0 ? STATUSES.map((s) => s.id) : [...STATUS_PATH.slice(i), 'non_retenue'];
    if (formDone && floor && DRIVEN.includes(current) && rank(floor) >= 0 && rank(floor) < i) ids = [...ids, floor];
  }
  return STATUSES.map((s) => s.id).filter((id) => ids.includes(id) || id === current);
}

/** The line under the list: what it offers and why (the same words for the page and the refusals). */
export function statusHint(current: string, formDone: boolean): string {
  if (current === 'non_retenue') return formDone ? 'Après « Non retenue », seul « Intérêt reçu » est possible.' : 'Son formulaire n’est pas terminé : après « Non retenue », seul « En cours » est possible.';
  if (current === 'en_cours' && !formDone) return 'Son formulaire n’est pas terminé : seuls « En cours » et « Non retenue » sont possibles. Les autres statuts s’ouvrent quand elle l’a envoyé.';
  return 'Seuls le statut actuel et ceux qui suivent sont proposés (« Non retenue » reste toujours possible). « Sujet validé » et « Candidature soumise » suivent les échanges : ils avancent quand elle répond et reculent quand tu rouvres les échanges ou lui envoies une nouvelle proposition.';
}

/** Why `next` cannot be set now (read from the database, not from what the page showed), or null. */
export async function statusRefusal(candidateId: number, next: string): Promise<string | null> {
  const c = await getCandidate(candidateId);
  if (!c) return 'Candidate introuvable';
  if (next === c.status) return null;
  const j = await journeyOf(candidateId);
  if (!statusChoices(c.status, !!c.completed_at, j ? STATUS_OF_STEP[j.step] : null).includes(next)) {
    if (c.status === 'non_retenue' || (c.status === 'en_cours' && !c.completed_at)) return statusHint(c.status, !!c.completed_at);
    const lock = await exchangeLock(candidateId); // the way back is named only where it exists
    const back = lock === 'approuve' || lock === 'soumise' ? ' Pour reprendre les échanges avec elle, utilise « Rouvrir les échanges » (sur la fiche, onglet du sujet).' : '';
    return `Impossible de revenir à « ${statusLabel(next)} » : ce statut est dépassé.${back}`;
  }
  if (next === 'sujet_valide') {
    const s = await getSubject(candidateId);
    if (!s?.title?.trim() || !s?.abstract?.trim()) return 'Pour valider le sujet, renseigne d’abord le titre et le résumé dans l’onglet du sujet.';
  }
  return null;
}
