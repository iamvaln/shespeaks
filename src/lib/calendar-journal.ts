// The journal of the calendar reminders: one row per candidate and key, so a reminder goes out once. The key holds the date it aims at
// (« submit:2026-10-26:3 »), so a changed date arms it again.
import { all, run } from './db.ts';
import { dayStartUtc } from './dates.ts';

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

/** The candidates written to on the programme's day `today` (Douala): no other pass writes to them again that day. */
export async function mailedToday(today: string): Promise<Set<number>> {
  return new Set((await all<{ candidate_id: number }>('SELECT DISTINCT candidate_id FROM calendar_reminders WHERE sent_at >= ?::timestamp', dayStartUtc(today))).map((r) => r.candidate_id));
}
