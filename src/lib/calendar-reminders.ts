// The calendar pass of the daily reminders: the closing of the form, the exchanges to finish and the submission, each aimed at a date.
// Idempotent: a reminder is written to the journal (calendar_reminders) before it is sent, and given back if the send fails.
import { all, getSetting } from './db.ts';
import { listEvents, type Candidate } from './data.ts';
import { appUrl, candidateClosingReminder, candidateExchangeReminder, candidateSubmitReminder, sendMail, type Mail } from './mail.ts';
import { journeyOf } from './proposals.ts';
import { screenProgress } from './reminders.ts';
import { mailboxKey } from './contact.ts';
import { claimCalendarReminder, mailedToday, releaseCalendarReminder, takenKeys } from './calendar-journal.ts';
import { pickTier, reminderDue } from './calendar.ts';
import { daysUntil, isoOrNull, todayIso } from './dates.ts';
import { fmtDate } from './i18n.ts';

/** At most this many candidates are written to in one run (sends are spaced out: 300 take under three minutes). */
export const MAX_PER_RUN = 300;
const TIERS = { closing: [3, 1], exchange: [7, 3, 1], submit: [7, 3, 1, 0] } as const;

export type CalendarKind = keyof typeof TIERS;
export interface DueReminder {
  id: number; name: string; kind: CalendarKind; tier: number; target: string; key: string; daysLeft: number; held?: string;
}
export interface CalendarReport { enabled: boolean; dry: boolean; checked: number; due: DueReminder[]; sent: number; failed: number }

interface Planned extends DueReminder { c: Candidate; skip: number[]; what?: 'choix' | 'sujet' | 'photo'; internal: boolean; callCloses: string | null; where: string | null }

/**
 * `dry`: nothing is written or sent, the report lists what the run would do (and what it holds back, with the reason). The preview works
 * before the switch is on; a real run does nothing while `calendar_reminders_enabled` is off.
 */
export async function runCalendarReminders(now = new Date(), opts: { dry?: boolean } = {}): Promise<CalendarReport> {
  const enabled = (await getSetting('calendar_reminders_enabled')) === 'true';
  const report: CalendarReport = { enabled, dry: !!opts.dry, checked: 0, due: [], sent: 0, failed: 0 };
  if (!enabled && !opts.dry) return report;
  const today = todayIso(now);
  const interest = isoOrNull(await getSetting('interest_deadline'));
  const internal = isoOrNull(await getSetting('internal_deadline'));
  const events = await listEvents();

  const rows: { c: Candidate; kind: CalendarKind }[] = [];
  if (interest && TIERS.closing.some((tier) => reminderDue({ today, target: interest, tier }))) {
    for (const c of await all<Candidate>(`SELECT * FROM candidates WHERE completed_at IS NULL AND status='en_cours' AND name IS NOT NULL AND name <> '' AND email IS NOT NULL AND email <> '' AND current_screen <> 'done' ORDER BY id`)) rows.push({ c, kind: 'closing' });
  }
  const journeyRows = await all<Candidate>(`SELECT * FROM candidates WHERE completed_at IS NOT NULL AND submitted_at IS NULL AND status IN ('diagnostic_recu','sujet_valide') AND email IS NOT NULL AND email <> '' ORDER BY id`);
  report.checked = rows.length + journeyRows.length;
  const steps = new Map<number, { kind: CalendarKind; what?: 'choix' | 'sujet' | 'photo' }>();
  for (const c of journeyRows) {
    const j = await journeyOf(c.id);
    if (!j || j.step === 'soumise') continue;
    if (j.step === 'soumission') steps.set(c.id, { kind: 'submit' });
    else if (j.waiting === 'candidate' && j.pending) steps.set(c.id, { kind: 'exchange', what: j.step as 'choix' | 'sujet' | 'photo' });
    else continue;
    rows.push({ c, kind: steps.get(c.id)!.kind });
  }

  const keys = await takenKeys(rows.map((r) => r.c.id));
  const planned: Planned[] = [];
  for (const { c, kind } of rows) {
    const ev = events.find((e) => e.city === c.city);
    const cfp = isoOrNull(ev?.cfp_close_date);
    // submission aims at the first date still ahead (today included): the team's internal date, then the call's own closing
    const target = kind === 'closing' ? interest : kind === 'exchange' ? internal : [internal, cfp].filter((d): d is string => !!d && d >= today).sort()[0] ?? null;
    if (!target) continue;
    const pick = pickTier({ today, target, tiers: [...TIERS[kind]], taken: (t) => !!keys.get(c.id)?.has(`${kind}:${target}:${t}`) });
    if (pick.send === null) continue;
    planned.push({
      id: c.id, name: c.name ?? '', kind, tier: pick.send, target, key: `${kind}:${target}:${pick.send}`, daysLeft: daysUntil(target, today) ?? 0,
      c, skip: pick.skip, what: steps.get(c.id)?.what, internal: target === internal, callCloses: cfp && cfp !== target ? cfp : null,
      where: ev?.submission_label || ev?.submission_url || null,
    });
  }

  // one email per candidate and day (the other passes check the same journal), one per mailbox and run, the closest date first
  const mailed = await mailedToday(today);
  const boxes = new Set<string>();
  const sendable: Planned[] = [];
  for (const p of planned.sort((a, b) => a.daysLeft - b.daysLeft || a.id - b.id)) {
    const box = mailboxKey(p.c.email ?? '');
    if (mailed.has(p.id)) p.held = 'déjà écrite aujourd’hui';
    else if (boxes.has(box)) p.held = 'même boîte mail qu’un autre dossier, demain';
    else if (sendable.length >= MAX_PER_RUN) p.held = `plafond de ${MAX_PER_RUN} par passage, demain`;
    else { boxes.add(box); sendable.push(p); }
    report.due.push({ id: p.id, name: p.name, kind: p.kind, tier: p.tier, target: p.target, key: p.key, daysLeft: p.daysLeft, held: p.held });
  }
  if (opts.dry) return report;

  for (const p of sendable) {
    if (!(await claimCalendarReminder(p.id, p.key))) continue; // another run took it
    for (const t of p.skip) await claimCalendarReminder(p.id, `${p.kind}:${p.target}:${t}`); // the closer tier replaces them
    const status = await sendMail(mailFor(p));
    if (status === 'failed') {
      await releaseCalendarReminder(p.id, p.key); // the next run tries again
      report.failed++;
    } else report.sent++;
  }
  return report;
}

function mailFor(p: Planned): Mail {
  const c = p.c;
  const url = `${appUrl()}/reprendre/${c.token}`;
  const day = (iso: string) => fmtDate(iso, c.locale);
  const base = p.kind === 'closing'
    ? candidateClosingReminder({ name: c.name ?? '' }, url, c.locale, { daysLeft: p.daysLeft, deadline: day(p.target), step: screenProgress(c) })
    : p.kind === 'exchange'
      ? candidateExchangeReminder(c.name ?? '', url, c.locale, { what: p.what ?? 'sujet', daysLeft: p.daysLeft, deadline: day(p.target) })
      : candidateSubmitReminder(c.name ?? '', url, c.locale, { daysLeft: p.daysLeft, date: day(p.target), kind: p.internal ? 'internal' : 'cfp', callCloses: p.internal && p.callCloses ? day(p.callCloses) : null, where: p.where });
  return { ...base, to: c.email!, kind: `calendar_${p.kind}`, candidateId: c.id };
}
