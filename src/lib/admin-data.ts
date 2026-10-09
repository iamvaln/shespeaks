// Queries for admin screens.
import { all, get } from './db.ts';
import { eventLabel, listEvents, type Candidate } from './data.ts';

export interface Row extends Candidate {
  coach_name: string | null;
  subject_title: string | null;
  a_title: string | null;
  note_count: number;
  event_label: string;
  topic: string;
}

export async function candidateRows(): Promise<Row[]> {
  const rows = await all<Omit<Row, 'event_label' | 'topic'>>(
    `SELECT c.*, co.name AS coach_name, s.title AS subject_title,
       (SELECT value FROM answers a WHERE a.candidate_id=c.id AND a.code IN ('C1','D1-a') ORDER BY a.code LIMIT 1) AS a_title,
       (SELECT COUNT(*)::int FROM notes n WHERE n.candidate_id=c.id) AS note_count
     FROM candidates c LEFT JOIN coaches co ON co.id=c.coach_id LEFT JOIN subjects s ON s.candidate_id=c.id
     WHERE c.name IS NOT NULL AND c.name <> ''`,
  );
  const events = await listEvents();
  return rows.map((r) => {
    let at = '';
    try { at = r.a_title ? String(JSON.parse(r.a_title)) : ''; } catch { at = ''; }
    return { ...r, event_label: eventLabel(r, events), topic: (r.subject_title || at || '').trim() };
  });
}

/** Interests waiting for a coach (the figure beside « Candidates » in the menu). */
export async function countToProcess(): Promise<number> {
  const r = await get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM candidates WHERE status='diagnostic_recu' AND name IS NOT NULL AND name <> ''`);
  return r?.n ?? 0;
}
