// The tabs of a candidate's fiche in the coach space. Pure, so the rule that decides where the tracks live can be tested.
export type FicheTab = { id: string; label: string; count: number | null };

/**
 * Start points A and B: the tracks are worked on in the « Sujet » tab until a series was sent and the block is read-only; from then on they
 * are for consultation, in their own tab placed after « Réponses ». Without a series ever sent (a status moved by hand, « déjà soumise »)
 * there is nothing to consult: the block stays where it was, read-only.
 */
export function ficheTabs(i: { hasTracks: boolean; tracksReadOnly: boolean; tracksSent: boolean; hasPlan: boolean; notes: number; photos: number }): FicheTab[] {
  const ownTab = tracksInOwnTab(i);
  return [
    { id: 'sujet', label: ownTab ? 'Sujet' : 'Sujet et pistes', count: null },
    { id: 'reponses', label: 'Réponses', count: null },
    ...(ownTab ? [{ id: 'pistes', label: 'Pistes envoyées', count: null }] : []),
    { id: 'notes', label: 'Notes et historique', count: i.notes || null },
    { id: 'photos', label: 'Photos', count: i.photos || null },
    ...(i.hasPlan ? [{ id: 'plan', label: 'Plan de route', count: null }] : []),
  ];
}
export const tracksInOwnTab = (i: { hasTracks: boolean; tracksReadOnly: boolean; tracksSent: boolean }): boolean => i.hasTracks && i.tracksReadOnly && i.tracksSent;
