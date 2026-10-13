// Queries for admin screens.
import { all, get } from './db.ts';
import { eventLabel, listEvents, type Candidate } from './data.ts';
import { countsAsSubmitted, journeyOf, toProposal } from './proposals.ts';
import { journey, journeyState, type JourneyState, type Proposal } from './journey.ts';

export interface Row extends Candidate {
  coach_name: string | null;
  subject_title: string | null;
  a_title: string | null;
  note_count: number;
  /** How many proposals were sent to her (0: nobody has worked on her interest yet). */
  proposal_count: number;

  event_label: string;
  topic: string;
  /** Where the exchanges with her stand (null while her form is not finished, or once she is « non retenue »). */
  journey: JourneyState | null;
}

export async function candidateRows(): Promise<Row[]> {
  const rows = await all<Omit<Row, 'event_label' | 'topic' | 'journey'> & { application_state: string | null; photo_count: number }>(
    `SELECT c.*, co.name AS coach_name, s.title AS subject_title, s.application_state,
       (SELECT COUNT(*)::int FROM photos ph WHERE ph.candidate_id=c.id) AS photo_count,
       (SELECT value FROM answers a WHERE a.candidate_id=c.id AND a.code IN ('C1','D1-a') ORDER BY a.code LIMIT 1) AS a_title,
       (SELECT COUNT(*)::int FROM notes n WHERE n.candidate_id=c.id) AS note_count,
       (SELECT COUNT(*)::int FROM proposals p WHERE p.candidate_id=c.id) AS proposal_count
     FROM candidates c LEFT JOIN coaches co ON co.id=c.coach_id LEFT JOIN subjects s ON s.candidate_id=c.id
     WHERE c.name IS NOT NULL AND c.name <> ''`,
  );
  const [events, sent] = await Promise.all([
    listEvents(),
    all<Omit<Proposal, 'payload' | 'response_data'> & { payload: string; response_data: string | null }>('SELECT * FROM proposals ORDER BY id'), // one query for the whole list, never one per row
  ]);
  const byCandidate = new Map<number, Proposal[]>();
  for (const x of sent) {
    const list = byCandidate.get(x.candidate_id) ?? [];
    list.push(toProposal(x));
    byCandidate.set(x.candidate_id, list);
  }
  return rows.map(({ application_state, photo_count, ...r }) => {
    let at = '';
    try { at = r.a_title ? String(JSON.parse(r.a_title)) : ''; } catch { at = ''; }
    const proposals = byCandidate.get(r.id) ?? [];
    // the same computation as her fiche (journeyOf), from the rows already read
    const j = r.completed_at && r.status !== 'non_retenue'
      ? journeyState(journey({ branch: r.branch, photoValidatedAt: r.photo_validated_at ?? null, submitted: countsAsSubmitted(r, application_state), proposals }), proposals, photo_count)
      : null;
    return { ...r, event_label: eventLabel(r, events), topic: (r.subject_title || at || '').trim(), journey: j };
  });
}

/**
 * The figure beside « Candidates » in the menu: the work left for the coaches.
 * - new interests nobody has worked on yet (received, nothing sent, not already submitted at intake), counted in SQL;
 * - answers she sent that the coach has not dealt with, but only when the coach has the hand: an approval whose photo is already
 *   validated asks nothing of her (the candidate submits). The journey is computed for those candidates only (a handful).
 * It shows on every coach page: a failure answers 0 (and is logged) rather than breaking the page.
 */
export async function countToProcess(): Promise<number> {
  try {
    const named = `c.name IS NOT NULL AND c.name <> ''`;
    const fresh = await get<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM candidates c LEFT JOIN subjects s ON s.candidate_id=c.id
       WHERE ${named} AND c.status='diagnostic_recu' AND c.submitted_at IS NULL AND COALESCE(s.application_state,'') NOT IN ('soumise','retenue')
         AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.candidate_id=c.id)`);
    const answered = await all<{ id: number }>(
      `SELECT DISTINCT c.id FROM proposals p JOIN candidates c ON c.id=p.candidate_id
       WHERE ${named} AND c.status <> 'non_retenue' AND p.state='repondue' AND p.handled_at IS NULL`);
    let n = fresh?.n ?? 0;
    for (const { id } of answered) if ((await journeyOf(id))?.waiting === 'coach') n++;
    return n;
  } catch (e) {
    console.error('[admin] menu figure failed', e);
    return 0;
  }
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
