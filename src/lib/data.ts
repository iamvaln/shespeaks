// Data access for candidates, answers, tracks, subjects, events, refs.
import crypto from 'node:crypto';
import { all, get, getSetting, insert, run } from './db.ts';
import { DEFAULT_ANGLES, DEFAULT_DOMAINS, OTHER_EVENT, type Answers, type Answer, type Option, type Refs, type Locale, type Branch } from './questions.ts';
import { norm } from './text.ts';
import type { DevfestEvent } from './roadmap.ts';

export interface Candidate {
  id: number;
  token: string;
  name: string | null;
  city: string | null;
  city_other: string | null;
  whatsapp: string | null;
  email: string | null;
  locale: Locale;
  talk_language: string | null;
  role: string | null;
  seniority: string | null;
  branch: Branch | null;
  status: string;
  coach_id: number | null;
  current_screen: string;
  consent_photo: number;
  selected_photo_id: number | null;
  next_point_date: string | null;
  completed_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}
export interface Track {
  id: number;
  candidate_id: number;
  title: string;
  angle: string | null;
  format: string | null;
  domain: string | null;
  hook: string | null;
  origin: string;
  state: string;
  position: number;
}
export interface Subject {
  candidate_id: number;
  title: string | null;
  abstract: string | null;
  audience: string | null;
  format: string | null;
  application_state: string;
  abstract_edited: number;
}
export interface Photo {
  id: number;
  candidate_id: number;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  created_at: string;
}
export interface Coach {
  id: number;
  name: string;
  whatsapp: string | null;
  email: string;
  active: number;
  created_at: string;
}

export const newToken = () => crypto.randomBytes(24).toString('base64url');

// ---- referentials ------------------------------------------------------------
function parseRef(raw: string, fallback: Option[]): Option[] {
  const out: Option[] = [];
  for (const line of raw.split('\n')) {
    const [value, fr, en] = line.split('|').map((s) => s?.trim());
    if (value && fr) out.push({ value, label: { fr, en: en || fr } });
  }
  return out.length ? out : fallback;
}
export const refsToText = (o: Option[]) => o.map((x) => `${x.value} | ${x.label.fr} | ${x.label.en}`).join('\n');
export async function getRefs(): Promise<Refs> {
  const domains = parseRef(await getSetting('domains'), DEFAULT_DOMAINS);
  // Angle ids are fixed (tied to title templates): keep only known ids, fill missing from defaults.
  const custom = parseRef(await getSetting('angles'), DEFAULT_ANGLES);
  const angles = DEFAULT_ANGLES.map((d) => custom.find((c) => c.value === d.value) ?? d);
  // Events come from the admin calendar (value = event slug). Past events stay selectable until a coach removes them.
  const events: Option[] = (await listEvents()).map((e) => ({ value: e.city, label: { fr: eventName(e), en: eventName(e) } }));
  return { domains, angles, events: [...events, OTHER_EVENT] };
}

// ---- candidates --------------------------------------------------------------
export const getCandidate = (id: number) => get<Candidate>('SELECT * FROM candidates WHERE id=?', id);
export const getCandidateByToken = async (token: string) => (token ? get<Candidate>('SELECT * FROM candidates WHERE token=?', token) : undefined);

/** Least-loaded active coach (with a single coach at launch this is always her). */
export async function pickCoachId(): Promise<number | null> {
  const r = await get<{ id: number }>(
    `SELECT c.id FROM coaches c WHERE c.active=1
     ORDER BY (SELECT COUNT(*) FROM candidates x WHERE x.coach_id=c.id), c.id LIMIT 1`,
  );
  return r?.id ?? null;
}

export async function createCandidate(locale: Locale): Promise<Candidate> {
  const id = await insert('INSERT INTO candidates (token, locale, coach_id) VALUES (?,?,?)', newToken(), locale, await pickCoachId());
  return (await getCandidate(id))!;
}

export async function getAnswers(id: number): Promise<Answers> {
  const rows = await all<{ code: string; value: string }>('SELECT code,value FROM answers WHERE candidate_id=?', id);
  const out: Answers = {};
  for (const r of rows) out[r.code] = JSON.parse(r.value) as Answer;
  return out;
}
export async function setAnswers(id: number, a: Answers) {
  const up = 'INSERT INTO answers (candidate_id,code,value) VALUES (?,?,?) ON CONFLICT(candidate_id,code) DO UPDATE SET value=excluded.value';
  for (const [code, v] of Object.entries(a)) await run(up, id, code, JSON.stringify(v));
}
export async function deleteAnswers(id: number, codes: string[]) {
  for (const c of codes) await run('DELETE FROM answers WHERE candidate_id=? AND code=?', id, c);
}

export const getTracks = (id: number) => all<Track>('SELECT * FROM tracks WHERE candidate_id=? ORDER BY position, id', id);
export const getSubject = (id: number) => get<Subject>('SELECT * FROM subjects WHERE candidate_id=?', id);
export const getPhotos = (id: number) => all<Photo>('SELECT * FROM photos WHERE candidate_id=? ORDER BY id', id);
export const getCoach = async (id: number | null) => (id ? get<Coach>('SELECT * FROM coaches WHERE id=?', id) : undefined);
export const listCoaches = () => all<Coach & { load: number }>(
  `SELECT c.*, (SELECT COUNT(*)::int FROM candidates x WHERE x.coach_id=c.id) AS load FROM coaches c ORDER BY c.active DESC, c.name`,
);

const NOW = `(now() at time zone 'utc')`;
export async function touchCandidate(id: number, resetReminders = false) {
  await run(
    `UPDATE candidates SET updated_at=${NOW}, last_activity_at=${NOW}${resetReminders ? ', reminders_sent=0, last_reminder_at=NULL' : ''} WHERE id=?`,
    id,
  );
}

/** A coach's edit (note, follow-up date): refreshes the list order but is not candidate activity, so reminders and « inactive depuis » stay true. */
export async function markUpdated(id: number) {
  await run(`UPDATE candidates SET updated_at=${NOW} WHERE id=?`, id);
}

/**
 * Takes the next automatic-reminder slot of an unfinished candidate. False when another run took it, or when she finished or was
 * set aside since the list was read: the loop that sends the emails reads its list first and works through it slowly, so without
 * these two conditions a candidate who completes her form in the meantime would still be told to finish it.
 */
export async function claimReminder(id: number, sent: number): Promise<boolean> {
  const n = await run(
    `UPDATE candidates SET reminders_sent=?, last_reminder_at=${NOW} WHERE id=? AND reminders_sent=? AND status='en_cours' AND completed_at IS NULL`,
    sent + 1, id, sent,
  );
  return n > 0;
}

export async function setStatus(id: number, newStatus: string, author: string) {
  const c = await getCandidate(id);
  if (!c || c.status === newStatus) return;
  await run(`UPDATE candidates SET status=?, updated_at=${NOW} WHERE id=?`, newStatus, id);
  await run('INSERT INTO status_history (candidate_id,old_status,new_status,author) VALUES (?,?,?,?)', id, c.status, newStatus, author);
}

// ---- events / calendar -------------------------------------------------------
export type EventRow = DevfestEvent & { id: number };
export const listEvents = () => all<EventRow>('SELECT * FROM devfest_events ORDER BY event_date IS NULL, event_date, name');
/** Public name of an event: "DevFest Douala 2026" (falls back to the place name). */
export const eventName = (e: { title?: string | null; name: string }) => e.title?.trim() || e.name;

export async function eventFor(c: Pick<Candidate, 'city' | 'city_other'>): Promise<DevfestEvent | null> {
  const key = c.city === 'autre' ? norm(c.city_other ?? '') : (c.city ?? '');
  if (!key) return null;
  const events = await listEvents();
  return events.find((e) => e.city === key || norm(e.name) === key || norm(eventName(e)) === key) ?? null;
}

/** Name of the event a candidate chose; "other" events show what she typed. */
export function eventLabel(c: Pick<Candidate, 'city' | 'city_other'>, events: EventRow[], locale: Locale = 'fr'): string {
  if (c.city === 'autre') return c.city_other || OTHER_EVENT.label[locale];
  const e = events.find((x) => x.city === c.city);
  return e ? eventName(e) : c.city || '—';
}
export async function eventLabelFor(c: Pick<Candidate, 'city' | 'city_other'>, locale: Locale = 'fr'): Promise<string> {
  return eventLabel(c, await listEvents(), locale);
}

