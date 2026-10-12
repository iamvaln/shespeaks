// What the coach may set in « Suivi »: the statuses that are ahead. A status that is behind is gone from the list (the exchanges drive the
// first ones, and « Rouvrir les échanges » is the way back); « non retenue » is an exit that stays available, and can be taken back.
import { STATUSES, statusLabel } from './db.ts';
import { getCandidate, getSubject } from './data.ts';

/** The forward path of a candidacy; « non retenue » sits outside it. */
export const STATUS_PATH: readonly string[] = ['en_cours', 'diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'slides_validees', 'repetition_faite', 'jour_j'];

/** The statuses offered for a candidate now at `current` (always including it), in the order of STATUSES. */
export function statusChoices(current: string, formDone: boolean): string[] {
  let ids: readonly string[];
  if (current === 'non_retenue') ids = ['diagnostic_recu', 'non_retenue']; // a « non retenue » set by mistake can be taken back: she comes back at « Intérêt reçu »
  else if (current === 'en_cours' && !formDone) ids = ['en_cours', 'non_retenue']; // the app moves her on when she finishes the form
  else {
    const i = STATUS_PATH.indexOf(current);
    ids = i < 0 ? STATUSES.map((s) => s.id) : [...STATUS_PATH.slice(i), 'non_retenue'];
  }
  return STATUSES.map((s) => s.id).filter((id) => ids.includes(id) || id === current);
}

/** Why `next` cannot be set now (read from the database, not from what the page showed), or null. */
export async function statusRefusal(candidateId: number, next: string): Promise<string | null> {
  const c = await getCandidate(candidateId);
  if (!c) return 'Candidate introuvable';
  if (next === c.status) return null;
  const choices = statusChoices(c.status, !!c.completed_at);
  if (!choices.includes(next)) {
    if (c.status === 'non_retenue') return 'Après « Non retenue », seul « Intérêt reçu » est possible.';
    if (c.status === 'en_cours' && !c.completed_at) return 'Son formulaire n’est pas terminé : seuls « En cours » et « Non retenue » sont possibles.';
    return `Impossible de revenir à « ${statusLabel(next)} » : ce statut est dépassé. Pour reprendre les échanges avec elle, utilise « Rouvrir les échanges » (onglet « Sujet et pistes »).`;
  }
  if (next === 'sujet_valide') {
    const s = await getSubject(candidateId);
    if (!s?.title?.trim() || !s?.abstract?.trim()) return 'Pour valider le sujet, renseigne d’abord le titre et le résumé dans l’onglet « Sujet et pistes ».';
  }
  return null;
}
