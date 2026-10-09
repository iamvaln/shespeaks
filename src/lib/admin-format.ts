// Small pure helpers shared by the coach-space screens (kept free of framework imports so they are unit-tested).

/** Short wording of the start point, for lists (the long form « A · Recherche de sujet » is for emails and the fiche). */
export const BRANCH_SHORT: Record<string, string> = {
  A: 'Cherche un sujet',
  B: 'A un domaine',
  C: 'A un sujet précis',
  D: 'Proposition prête',
};

export type Tone = 'amber' | 'soft' | 'neutral' | 'green' | 'red';
/** Colour family of a status pill: amber = a coach must act, soft = in progress, green/red = outcome. */
export function statusTone(status: string): Tone {
  if (status === 'diagnostic_recu') return 'amber';
  if (status === 'en_cours') return 'soft';
  if (status === 'retenue' || status === 'jour_j') return 'green';
  if (status === 'non_retenue') return 'red';
  return 'neutral';
}

const toDate = (s: string) => new Date(s.replace(' ', 'T') + 'Z');

/** Whole hours since a stored UTC timestamp (« YYYY-MM-DD HH:MM:SS »); never negative. */
export function elapsedHours(since: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - toDate(since).getTime()) / 3_600_000));
}

/** « moins d’1 h », « 5 h », « 1 jour », « 3 jours »: how long ago, in the unit a coach thinks in. */
export function elapsed(since: string, now: Date = new Date()): string {
  const h = elapsedHours(since, now);
  if (h < 1) return 'moins d’1 h';
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 jour' : `${d} jours`;
}

/** « aujourd’hui », « demain », « dans 3 jours », « en retard de 2 jours » from a number of calendar days. */
export function dayLabel(days: number): string {
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  if (days === -1) return 'en retard d’un jour';
  return days > 1 ? `dans ${days} jours` : `en retard de ${-days} jours`;
}

/** Page numbers to show under a list: first, last and the neighbours of the current page, « … » for the gaps. */
export function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = [...new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total))].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  keep.forEach((n, i) => {
    const prev = keep[i - 1];
    if (i && n - prev === 2) out.push(prev + 1);
    else if (i && n - prev > 2) out.push('…');
    out.push(n);
  });
  return out;
}

/** One value out of a query parameter: ?q=a&q=b arrives as a list, a missing one as undefined. */
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';
