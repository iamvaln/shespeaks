// The journal of the calendar reminders: one row per candidate and key, so a reminder goes out once. The key holds the date it aims at
// (« submit:2026-10-26:3 »), so a changed date arms it again.
import { all, run } from './db.ts';
import { dayStartUtc } from './dates.ts';
import { mailboxKey } from './contact.ts';

/** Takes the reminder: true when this call wrote the row (and so must send), false when it was already taken. */
export async function claimCalendarReminder(candidateId: number, key: string): Promise<boolean> {
  return (await run('INSERT INTO calendar_reminders (candidate_id, key) VALUES (?,?) ON CONFLICT DO NOTHING', candidateId, key)) > 0;
}

/** Gives the reminder back after a failed send, so the next run tries again. */
export async function releaseCalendarReminder(candidateId: number, key: string): Promise<void> {
  await run('DELETE FROM calendar_reminders WHERE candidate_id=? AND key=?', candidateId, key);
}

/** The keys already written for these candidates. */
export async function takenKeys(candidateIds: number[]): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>();
  if (!candidateIds.length) return out;
  const ids = candidateIds.filter((n) => Number.isInteger(n)).join(','); // integers only: safe to write into the statement
  for (const r of await all<{ candidate_id: number; key: string }>(`SELECT candidate_id, key FROM calendar_reminders WHERE candidate_id IN (${ids})`)) {
    (out.get(r.candidate_id) ?? out.set(r.candidate_id, new Set()).get(r.candidate_id)!).add(r.key);
  }
  return out;
}

/**
 * Who was written to on the programme's day `today` (Douala), by any reminder pass: a calendar reminder, an abandoned-form reminder or the
 * 48 h proposal reminder. No other pass writes to them again that day, nor to another dossier on the same mailbox (`boxes`).
 */
export async function mailedToday(today: string): Promise<{ ids: Set<number>; boxes: Set<string> }> {
  const start = dayStartUtc(today);
  const rows = await all<{ id: number; email: string | null }>(
    `SELECT c.id, c.email FROM candidates c
     WHERE c.id IN (SELECT candidate_id FROM calendar_reminders WHERE sent_at >= ?::timestamp)
        OR c.last_reminder_at >= ?::timestamp
        OR c.id IN (SELECT candidate_id FROM proposals WHERE reminded_at >= ?::timestamp)`, start, start, start);
  return { ids: new Set(rows.map((r) => r.id)), boxes: new Set(rows.filter((r) => r.email).map((r) => mailboxKey(r.email!))) };
}

/** When each of these candidates was last written to by the calendar pass (never = absent): the one waiting longest goes first. */
export async function lastWrittenAt(candidateIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = candidateIds.filter((n) => Number.isInteger(n)).join(',');
  if (!ids) return out;
  for (const r of await all<{ candidate_id: number; at: string }>(`SELECT candidate_id, max(sent_at) AS at FROM calendar_reminders WHERE candidate_id IN (${ids}) GROUP BY candidate_id`)) out.set(r.candidate_id, String(r.at));
  return out;
}
