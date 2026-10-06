// Reminder engine: unfinished diagnostics → email to the candidate (if she left an address) AND alert to the coach(es).
// Idempotent: a candidate is "claimed" (counter bumped) before any email goes out, so overlapping runs never double-send.
import { all, getSetting, run, nowSql } from './db.ts';
import { cityLabel, getCandidate, type Candidate } from './data.ts';
import { appUrl, candidateReminder, coachStalledDigest, sendMail, type StalledItem } from './mail.ts';
import { SCREENS, flowFor } from './questions.ts';
import { coachRecipients } from './diagnostic.ts';

const toDate = (s: string) => new Date(s.replace(' ', 'T') + 'Z');
const hoursBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;

export interface ReminderReport {
  checked: number;
  candidateEmails: number;
  coachAlerts: number;
  due: { id: number; name: string; tier: number }[];
}

export function screenProgress(c: Candidate) {
  const flow = flowFor(c.branch);
  const idx = Math.max(0, flow.indexOf(c.current_screen));
  return { done: idx + 1, total: (c.branch ? flow.length : 6) + 1, label: SCREENS[c.current_screen]?.title.fr ?? c.current_screen };
}

export async function runReminders(now = new Date()): Promise<ReminderReport> {
  const report: ReminderReport = { checked: 0, candidateEmails: 0, coachAlerts: 0, due: [] };
  if ((await getSetting('reminders_enabled')) !== 'true') return report;
  const first = Number(await getSetting('reminder_first_hours')) || 24;
  const interval = Number(await getSetting('reminder_interval_hours')) || 48;
  const max = Number(await getSetting('reminder_max')) || 2;

  const rows = await all<Candidate>(`SELECT * FROM candidates WHERE status='en_cours' AND completed_at IS NULL AND name IS NOT NULL AND name <> ''`);
  report.checked = rows.length;
  const byRecipient = new Map<string, { name: string; items: StalledItem[] }>();

  for (const c of rows) {
    if (c.reminders_sent >= max) continue;
    const ref = toDate(c.reminders_sent === 0 ? c.last_activity_at : (c.last_reminder_at ?? c.last_activity_at));
    const threshold = c.reminders_sent === 0 ? first : interval;
    if (hoursBetween(now, ref) < threshold) continue;

    // claim first (idempotency)
    const tier = c.reminders_sent + 1;
    const claimed = await run(
      `UPDATE candidates SET reminders_sent=?, last_reminder_at=? WHERE id=? AND reminders_sent=?`,
      tier, nowSql(), c.id, c.reminders_sent,
    );
    if (claimed === 0) continue;
    report.due.push({ id: c.id, name: c.name ?? '', tier });

    const prog = screenProgress(c);
    if (c.email) {
      const m = candidateReminder({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale, prog);
      await sendMail({ ...m, to: c.email, kind: `candidate_reminder_${tier}`, candidateId: c.id });
      report.candidateEmails++;
    }
    const item: StalledItem = {
      name: c.name ?? '', cityLabel: cityLabel(c), whatsapp: c.whatsapp ?? '', email: c.email, screenLabel: prog.label,
      hoursIdle: Math.round(hoursBetween(now, toDate(c.last_activity_at))), tier, url: `${appUrl()}/admin/candidates/${c.id}`,
    };
    for (const r of await coachRecipients(c)) {
      const g = byRecipient.get(r.email) ?? { name: r.name, items: [] };
      g.items.push(item);
      byRecipient.set(r.email, g);
    }
  }
  for (const [email, g] of byRecipient) {
    const m = coachStalledDigest(g.name, g.items);
    await sendMail({ ...m, to: email, kind: 'coach_stalled_digest' });
    report.coachAlerts++;
  }
  return report;
}

/** Manual reminder from the coach's fiche (does not touch the automatic counter). */
export async function sendReminderNow(candidateId: number): Promise<boolean> {
  const c = await getCandidate(candidateId);
  if (!c || !c.email || c.completed_at) return false;
  const m = candidateReminder({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale, screenProgress(c));
  await sendMail({ ...m, to: c.email, kind: 'candidate_reminder_manual', candidateId });
  return true;
}
