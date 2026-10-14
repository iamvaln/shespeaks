// The common calendar of the programme (spec 2026-10-13): the date after which no application is accepted, the events a candidate may
// choose, the coherence of the dates the team sets, and when a reminder is due. Pure (no database, no framework): unit-tested.
import { addDays, daysUntil, isoOrNull } from './dates.ts';

/** Days of preparation the team wants at least between the last day to send an interest (and the internal submission day) and the rehearsal. */
export const MIN_PREP_DAYS = 14;

/**
 * Applications are accepted through the deadline day (23:59 in the programme's zone). `today` is the programme's day.
 * No deadline set (or an unreadable one) = always open; a dossier the coach admitted is open whatever the day.
 */
export function admissionOpen(i: { today: string; interestDeadline?: string | null; admittedLate?: boolean }): boolean {
  if (i.admittedLate) return true;
  const d = isoOrNull(i.interestDeadline);
  return !d || i.today <= d;
}

/**
 * The events a new candidate may choose: a real event day, not yet past, and after the rehearsal day when there is one.
 * « Autre » and events without a date are never offered.
 */
export function openEvents<T extends { event_date?: string | null }>(events: T[], today: string, rehearsalDate?: string | null): T[] {
  const r = isoOrNull(rehearsalDate);
  return events.filter((e) => {
    const d = isoOrNull(e.event_date);
    return !!d && d >= today && (!r || d > r);
  });
}

export interface CalendarInput {
  interestDeadline?: string | null;
  internalDeadline?: string | null;
  rehearsalDate?: string | null;
  events?: { event_date?: string | null; name?: string | null; cfp_close_date?: string | null }[];
  /** The programme's day today: with it, the warnings about what is closed now and about events already past are given. */
  today?: string;
}

const dayLabel = (iso: string) => iso.split('-').reverse().join('/');

/** What looks wrong in the dates the team set (shown in the settings, never blocking). French: the coach space is French only. */
export function calendarWarnings(i: CalendarInput): string[] {
  const out: string[] = [];
  const named = [['la date limite des intérêts', i.interestDeadline], ['la date interne de soumission', i.internalDeadline], ['le jour de répétition', i.rehearsalDate]] as const;
  for (const [label, raw] of named) if (raw && !isoOrNull(raw)) out.push(`${label[0].toUpperCase()}${label.slice(1)} n’est pas une date lisible (AAAA-MM-JJ).`);
  const interest = isoOrNull(i.interestDeadline), internal = isoOrNull(i.internalDeadline), rehearsal = isoOrNull(i.rehearsalDate);
  if (interest && internal && interest >= internal) out.push('La date limite des intérêts devrait précéder la date interne de soumission (au plus tard la veille).');
  if (i.today) {
    if (interest && interest < i.today) out.push(`La date limite des intérêts (${dayLabel(interest)}) est passée : le formulaire est déjà fermé aux nouvelles candidatures.`);
    else if (openEvents(i.events ?? [], i.today, rehearsal).length === 0) out.push('Aucun événement n’est proposé aujourd’hui (il faut une date d’événement à venir, après le jour de répétition) : le formulaire est fermé aux nouvelles candidatures.');
    // the submission reminders aim at the internal date first: after an event's call has closed they would urge candidates for nothing
    const closing = (i.events ?? []).filter((e) => { const c = isoOrNull(e.cfp_close_date); return !!c && !!internal && c >= i.today! && internal > c; });
    if (closing.length) out.push(`La date interne de soumission (${dayLabel(internal!)}) est après la clôture de l’appel de ${closing.map((e) => `${e.name ?? '?'} (${dayLabel(isoOrNull(e.cfp_close_date)!)})`).join(', ')} : les candidates de ces événements seraient relancées trop tard.`);
  }
  if (rehearsal) {
    for (const [label, d] of [['la date limite des intérêts', interest], ['la date interne de soumission', internal]] as const) {
      if (!d) continue;
      const gap = daysUntil(rehearsal, d);
      if (gap === null || gap >= MIN_PREP_DAYS) continue;
      out.push(gap < 0
        ? `Le jour de répétition (${dayLabel(rehearsal)}) tombe avant ${label} (${dayLabel(d)}) : la répétition aurait lieu avant la soumission.`
        : `Il y a ${gap} jour${gap > 1 ? 's' : ''} entre ${label} (${dayLabel(d)}) et le jour de répétition (${dayLabel(rehearsal)}) : visez ${MIN_PREP_DAYS} jours au moins.`);
    }
    const before = (i.events ?? []).filter((e) => { const d = isoOrNull(e.event_date); return !!d && d <= rehearsal && (!i.today || d >= i.today); });
    const close = (i.events ?? []).filter((e) => { const d = isoOrNull(e.event_date); const gap = d ? daysUntil(d, rehearsal) : null; return gap !== null && gap > 0 && gap < 7; });
    if (close.length) out.push(`${close.length === 1 ? 'Un événement a lieu' : `${close.length} événements ont lieu`} moins de 7 jours après le jour de répétition : les dernières tâches de préparation se tassent (${close.map((e) => e.name ?? '?').join(', ')}).`);
    if (before.length) out.push(`${before.length === 1 ? 'Un événement a lieu' : `${before.length} événements ont lieu`} au plus tard le jour de répétition${before.length === 1 ? '' : ' (ou avant)'} : ${before.length === 1 ? 'il n’est' : 'ils ne sont'} plus proposé${before.length === 1 ? '' : 's'} aux candidates (${before.map((e) => e.name ?? '?').join(', ')}).`);
  }
  return out;
}

/**
 * A reminder tier `tier` (days before `target`) is due on `today` for two days: the day it falls on and the next one (a cron that did not run
 * is made up for the day after, never later), and never after the target day. Tier 0 is the target day itself.
 */
export function reminderDue(i: { today: string; target: string | null | undefined; tier: number }): boolean {
  const left = daysUntil(isoOrNull(i.target), i.today);
  return left !== null && left >= Math.max(0, i.tier - 1) && left <= i.tier;
}

export type UrgencyLevel = 'confortable' | 'normale' | 'serree' | 'tres_serree';
/** How tight the time between her interest and the rehearsal is, and so how often the team checks in with her. */
export function urgency(days: number | null | undefined): { level: UrgencyLevel; everyDays: number } {
  if (days === null || days === undefined || Number.isNaN(days)) return { level: 'normale', everyDays: 4 };
  if (days >= 28) return { level: 'confortable', everyDays: 7 };
  if (days >= 21) return { level: 'normale', everyDays: 4 };
  if (days >= 14) return { level: 'serree', everyDays: 2 };
  return { level: 'tres_serree', everyDays: 1 };
}

/** The rehearsal day for a candidate: the common one, else ten days before her event, else none. */
export function rehearsalFor(i: { rehearsalDate?: string | null; eventDay?: string | null }): string | null {
  const r = isoOrNull(i.rehearsalDate);
  if (r) return r;
  const e = isoOrNull(i.eventDay);
  return e ? addDays(e, -10) : null;
}

/**
 * Of the tiers of one target, those due today and not yet written: the closest one goes out, the others are only written (a cron that
 * missed the day before would otherwise send « 1 day left » and « last day » together). `taken` says whether a tier is already in the journal.
 */
export function pickTier(i: { today: string; target: string | null | undefined; tiers: number[]; taken: (tier: number) => boolean }): { send: number | null; skip: number[] } {
  const due = i.tiers.filter((t) => reminderDue({ today: i.today, target: i.target, tier: t }) && !i.taken(t)).sort((a, b) => a - b);
  return { send: due.length ? due[0] : null, skip: due.slice(1) };
}
