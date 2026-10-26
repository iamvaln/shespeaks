// Who may still start or go on with the form (the last day to send an interest, the events on offer).
import { getSetting } from './db.ts';
import { getFormRefs, listEvents, type Candidate } from './data.ts';
import { admissionOpen, lastOfferDay } from './calendar.ts';
import { isoOrNull, todayIso } from './dates.ts';

/**
 * Whether this person may still start or go on with the form: before the last day to send an interest (or admitted by the team),
 * and, to start one, with an event on offer. A form already started closes with her event, a week before its call for speakers closes
 * (she could no longer prepare and submit in time). `closedOn` is the last day when it is a date that closed it.
 */
export type Admission = { open: true } | { open: false; closedOn: string | null };
export async function admission(c: Pick<Candidate, 'admitted_late_at' | 'city'> | null | undefined, today = todayIso()): Promise<Admission> {
  const deadline = await getSetting('interest_deadline');
  if (!admissionOpen({ today, interestDeadline: deadline, admittedLate: !!c?.admitted_late_at })) return { open: false, closedOn: isoOrNull(deadline) };
  if (!c && (await getFormRefs(today)).events.length === 0) return { open: false, closedOn: null };
  if (c?.city && !c.admitted_late_at) {
    const ev = (await listEvents()).find((e) => e.city === c.city);
    const last = ev ? lastOfferDay(ev) : null;
    if (last && today > last) return { open: false, closedOn: last };
  }
  return { open: true };
}
