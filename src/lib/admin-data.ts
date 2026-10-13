// Queries for admin screens.
import { all, get } from './db.ts';
import { eventLabel, listEvents, type Candidate } from './data.ts';
import { countsAsSubmitted, toProposal } from './proposals.ts';
import { journey, journeyState, type JourneyState, type Proposal } from './journey.ts';

export interface Row extends Candidate {
  coach_name: string | null;
  subject_title: string | null;
  a_title: string | null;
  note_count: number;
  /** How many proposals were sent to her (0: nobody has worked on her interest yet). */
  proposal_count: number;
  /** She answered and the coach has not dealt with it yet (not handled, nothing sent since). */
  answer_to_handle: boolean;
  event_label: string;
  topic: string;
  /** Where the exchanges with her stand (null while her form is not finished, or once she is « non retenue »). */
  journey: JourneyState | null;
}

export async function candidateRows(): Promise<Row[]> {
  const rows = await all<Omit<Row, 'event_label' | 'topic' | 'journey' | 'answer_to_handle'> & { application_state: string | null; photo_count: number }>(
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
    const answer_to_handle = proposals.some((p) => p.state === 'repondue' && !p.handled_at);
    return { ...r, event_label: eventLabel(r, events), topic: (r.subject_title || at || '').trim(), journey: j, answer_to_handle };
  });
}

/**
 * Work left for the coaches: the coach has the hand (the same computation as the list and the fiche), and it is either a new interest
 * nobody has worked on yet (nothing sent) or an answer she has not dealt with. An answer whose next step is hers (she approved her
 * subject and the photo is already validated: she submits) is no work, nor anything once she counts as submitted.
 */
export const isWorkLeft = (r: Pick<Row, 'journey' | 'status' | 'proposal_count' | 'answer_to_handle'>): boolean =>
  r.journey?.waiting === 'coach' && ((r.status === 'diagnostic_recu' && r.proposal_count === 0) || r.answer_to_handle);
/** The figure beside « Candidates » in the menu. */
export async function countToProcess(): Promise<number> {
  return (await candidateRows()).filter(isWorkLeft).length;
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
