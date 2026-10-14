// Reminder engine: unfinished diagnostics → email to the candidate (if she left an address) AND alert to the coach(es).
// Idempotent: a candidate is "claimed" (counter bumped) before any email goes out, so overlapping runs never double-send.
import { all, get, getSetting } from './db.ts';
import { claimReminder, eventLabel, getCandidate, listEvents, type Candidate } from './data.ts';
import { appUrl, candidateProposalReminder, candidateReminder, coachStalledDigest, sendMail, type StalledItem } from './mail.ts';
import { SCREENS, flowFor, resumeScreen } from './questions.ts';
import { coachRecipients } from './diagnostic.ts';
import { mailboxKey } from './contact.ts';
import { countsAsSubmitted } from './proposals.ts';
import { admission } from './admission.ts';
import { admissionOpen } from './calendar.ts';
import { todayIso } from './dates.ts';
import { mailedToday } from './calendar-journal.ts';

const toDate = (s: string) => new Date(s.replace(' ', 'T') + 'Z');
const hoursBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;

export interface ReminderReport {
  checked: number;
  candidateEmails: number;
  coachAlerts: number;
  proposalReminders: number;
  due: { id: number; name: string; tier: number }[];
}

export function screenProgress(c: Pick<Candidate, 'branch' | 'current_screen'>) {
  const flow = flowFor(c.branch);
  const current = resumeScreen(c.branch, c.current_screen);
  const idx = Math.max(0, flow.indexOf(current));
  return { done: idx + 1, total: (c.branch ? flow.length : 5) + 1, label: SCREENS[current]?.title.fr ?? current };
}

export async function runReminders(now = new Date()): Promise<ReminderReport> {
  const report: ReminderReport = { checked: 0, candidateEmails: 0, coachAlerts: 0, proposalReminders: 0, due: [] };
  if ((await getSetting('reminders_enabled')) !== 'true') return report;
  const first = Number(await getSetting('reminder_first_hours')) || 24;
  const interval = Number(await getSetting('reminder_interval_hours')) || 48;
  const max = Number(await getSetting('reminder_max')) || 2;

  const rows = await all<Candidate>(`SELECT * FROM candidates WHERE status='en_cours' AND completed_at IS NULL AND name IS NOT NULL AND name <> ''`);
  report.checked = rows.length;
  const events = await listEvents();
  const byRecipient = new Map<string, { name: string; items: StalledItem[] }>();
  const mailedBoxes = new Set<string>();
  const today = todayIso(now);
  const interestDeadline = await getSetting('interest_deadline');
  const mailed = await mailedToday(today); // written to today by a pass (or on the same mailbox): one email a day, so they wait for tomorrow (nothing is claimed)

  for (const c of rows) {
    if (c.reminders_sent >= max) continue;
    // after the last day to send an interest the form is closed to anyone the team has not admitted: nobody is urged to finish it
    if (!admissionOpen({ today, interestDeadline, admittedLate: !!c.admitted_late_at })) continue;
    if (mailed.ids.has(c.id) || (c.email && mailed.boxes.has(mailboxKey(c.email)))) continue;
    const ref = toDate(c.reminders_sent === 0 ? c.last_activity_at : (c.last_reminder_at ?? c.last_activity_at));
    const threshold = c.reminders_sent === 0 ? first : interval;
    if (hoursBetween(now, ref) < threshold) continue;

    // claim first (idempotency)
    const tier = c.reminders_sent + 1;
    if (!(await claimReminder(c.id, c.reminders_sent))) continue;
    report.due.push({ id: c.id, name: c.name ?? '', tier });

    const prog = screenProgress(c);
    // One reminder email per mailbox and run: candidates parked on one address (a lost cookie and a second start, or an address
    // someone else typed) must not multiply what that inbox receives. The coaches' digest below still lists every candidate.
    const box = c.email ? mailboxKey(c.email) : '';
    if (c.email && !mailedBoxes.has(box)) {
      mailedBoxes.add(box);
      const m = candidateReminder({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale, prog);
      await sendMail({ ...m, to: c.email, kind: `candidate_reminder_${tier}`, candidateId: c.id });
      report.candidateEmails++;
    }
    const item: StalledItem = {
      name: c.name ?? '', eventLabel: eventLabel(c, events), whatsapp: c.whatsapp ?? '', email: c.email, screenLabel: prog.label,
      hoursIdle: Math.round(hoursBetween(now, toDate(c.last_activity_at))), tier, url: `${appUrl()}/admin/candidates/${c.id}`,
    };
    for (const r of await coachRecipients(c)) {
      const g = byRecipient.get(r.email) ?? { name: r.name, items: [] };
      g.items.push(item);
      byRecipient.set(r.email, g);
    }
  }
  report.proposalReminders = await remindPendingProposals(now);
  for (const [email, g] of byRecipient) {
    const m = coachStalledDigest(g.name, g.items, report.proposalReminders);
    await sendMail({ ...m, to: email, kind: 'coach_stalled_digest' });
    report.coachAlerts++;
  }
  return report;
}

/**
 * One reminder for a proposal left unanswered for 48 hours (claimed first, so two runs never send it twice).
 * Candidates a coach has set aside (non_retenue), without an address, or already counted as submitted are skipped.
 */
export async function remindPendingProposals(now = new Date()): Promise<number> {
  const due = await all<{ id: number; candidate_id: number; email: string | null }>(
    `SELECT p.id, p.candidate_id, c.email FROM proposals p JOIN candidates c ON c.id = p.candidate_id
     WHERE p.state='envoyee' AND p.reminded_at IS NULL AND p.sent_at <= (?::timestamp - interval '48 hours')
       AND c.status <> 'non_retenue' AND c.email IS NOT NULL AND c.email <> ''`,
    now.toISOString().replace('T', ' ').slice(0, 19));
  let sent = 0;
  const mailed = await mailedToday(todayIso(now)); // written to by a pass today (or her mailbox was): the reminder waits for tomorrow, still unclaimed
  for (const p of due) {
    if (mailed.ids.has(p.candidate_id) || (p.email && mailed.boxes.has(mailboxKey(p.email)))) continue;
    const claimed = await get<{ id: number }>(`UPDATE proposals SET reminded_at=(now() at time zone 'utc') WHERE id=? AND reminded_at IS NULL AND state='envoyee' RETURNING id`, p.id);
    if (!claimed) continue;
    const c = await getCandidate(p.candidate_id);
    if (!c?.email || c.status === 'non_retenue') continue;
    const sub = await get<{ application_state: string | null }>('SELECT application_state FROM subjects WHERE candidate_id=?', c.id);
    if (countsAsSubmitted(c, sub?.application_state)) continue; // /plan shows « soumise » and no answer form: nothing to remind
    const m = candidateProposalReminder(c.name ?? '', `${appUrl()}/reprendre/${c.token}`, c.locale);
    await sendMail({ ...m, to: c.email, kind: 'candidate_proposal_reminder', candidateId: c.id });
    sent++;
  }
  return sent;
}

/** Manual reminder from the coach's fiche (does not touch the automatic counter). 'unavailable' = no address or form already done. */
export async function sendReminderNow(candidateId: number): Promise<'sent' | 'logged' | 'failed' | 'unavailable' | 'closed'> {
  const c = await getCandidate(candidateId);
  if (!c || !c.email || c.completed_at) return 'unavailable';
  if (!(await admission(c)).open) return 'closed'; // her link would only lead to the « applications are closed » page: admit her first
  const m = candidateReminder({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale, screenProgress(c));
  return sendMail({ ...m, to: c.email, kind: 'candidate_reminder_manual', candidateId });
}
