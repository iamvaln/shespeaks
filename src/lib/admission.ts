// Who may still start or go on with the form (the last day to send an interest, the events on offer).
import { getSetting } from './db.ts';
import { getFormRefs, type Candidate } from './data.ts';
import { admissionOpen } from './calendar.ts';
import { isoOrNull, todayIso } from './dates.ts';

/**
 * Whether this person may still start or go on with the form: before the last day to send an interest (or admitted by the team),
 * and, to start one, with an event on offer. `closedOn` is the last day when it is the date that closed it.
 */
export type Admission = { open: true } | { open: false; closedOn: string | null };
export async function admission(c: Pick<Candidate, 'admitted_late_at'> | null | undefined, today = todayIso()): Promise<Admission> {
  const deadline = await getSetting('interest_deadline');
  if (!admissionOpen({ today, interestDeadline: deadline, admittedLate: !!c?.admitted_late_at })) return { open: false, closedOn: isoOrNull(deadline) };
  if (!c && (await getFormRefs(today)).events.length === 0) return { open: false, closedOn: null };
  return { open: true };
}
