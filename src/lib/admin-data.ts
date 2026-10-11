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
  // new interests, plus candidates whose answer to a proposal the coach has not dealt with yet
  const r = await get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM candidates c WHERE c.name IS NOT NULL AND c.name <> '' AND (
    c.status='diagnostic_recu' OR EXISTS (SELECT 1 FROM proposals p WHERE p.candidate_id=c.id AND p.state='repondue' AND p.handled_at IS NULL))`);
  return r?.n ?? 0;
}

export interface ToHandle { id: number; name: string; role: string | null; since: string; responses: string[] }

/** Candidates whose answer to a proposal the coach has not dealt with yet, the oldest answer first (one query). */
export async function answersToHandle(): Promise<ToHandle[]> {
  return all<ToHandle>(
    `SELECT c.id, c.name, c.role, MIN(p.answered_at) AS since, ARRAY_AGG(p.response ORDER BY p.answered_at, p.id) AS responses
     FROM proposals p JOIN candidates c ON c.id=p.candidate_id
     WHERE p.state='repondue' AND p.handled_at IS NULL AND c.name IS NOT NULL AND c.name <> ''
     GROUP BY c.id, c.name, c.role ORDER BY MIN(p.answered_at), c.id`,
  );
}
