// Queries for admin screens.
import { all } from './db.ts';
import { cityLabel, type Candidate } from './data.ts';

export interface Row extends Candidate {
  coach_name: string | null;
  subject_title: string | null;
  a_title: string | null;
  note_count: number;
  city_label: string;
  topic: string;
}

export function candidateRows(): Row[] {
  const rows = all<Omit<Row, 'city_label' | 'topic'>>(
    `SELECT c.*, co.name AS coach_name, s.title AS subject_title,
       (SELECT value FROM answers a WHERE a.candidate_id=c.id AND a.code IN ('C1','D1-a') ORDER BY a.code LIMIT 1) AS a_title,
       (SELECT COUNT(*) FROM notes n WHERE n.candidate_id=c.id) AS note_count
     FROM candidates c LEFT JOIN coaches co ON co.id=c.coach_id LEFT JOIN subjects s ON s.candidate_id=c.id
     WHERE c.name IS NOT NULL AND c.name <> ''`,
  );
  return rows.map((r) => {
    let at = '';
    try { at = r.a_title ? String(JSON.parse(r.a_title)) : ''; } catch { at = ''; }
    return { ...r, city_label: cityLabel(r), topic: (r.subject_title || at || '').trim() };
  });
}
