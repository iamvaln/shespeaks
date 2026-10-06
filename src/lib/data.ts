// Data access for candidates, answers, tracks, subjects, events, refs.
import crypto from 'node:crypto';
import { all, get, getSetting, run } from './db.ts';
import { DEFAULT_ANGLES, DEFAULT_DOMAINS, labelOf, CITIES, type Answers, type Answer, type Option, type Refs, type Locale, type Branch } from './questions.ts';
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
export function getRefs(): Refs {
  const domains = parseRef(getSetting('domains'), DEFAULT_DOMAINS);
  // Angle ids are fixed (tied to title templates): keep only known ids, fill missing from defaults.
  const custom = parseRef(getSetting('angles'), DEFAULT_ANGLES);
  const angles = DEFAULT_ANGLES.map((d) => custom.find((c) => c.value === d.value) ?? d);
  return { domains, angles };
}

// ---- candidates --------------------------------------------------------------
export const getCandidate = (id: number) => get<Candidate>('SELECT * FROM candidates WHERE id=?', id);
export const getCandidateByToken = (token: string) => (token ? get<Candidate>('SELECT * FROM candidates WHERE token=?', token) : undefined);

/** Least-loaded active coach (with a single coach at launch this is always her). */
export function pickCoachId(): number | null {
  const r = get<{ id: number }>(
    `SELECT c.id FROM coaches c WHERE c.active=1
     ORDER BY (SELECT COUNT(*) FROM candidates x WHERE x.coach_id=c.id), c.id LIMIT 1`,
  );
  return r?.id ?? null;
}

export function createCandidate(locale: Locale): Candidate {
  const token = newToken();
  const info = run('INSERT INTO candidates (token, locale, coach_id) VALUES (?,?,?)', token, locale, pickCoachId());
  return getCandidate(Number(info.lastInsertRowid))!;
}

export function getAnswers(id: number): Answers {
  const rows = all<{ code: string; value: string }>('SELECT code,value FROM answers WHERE candidate_id=?', id);
  const out: Answers = {};
  for (const r of rows) out[r.code] = JSON.parse(r.value) as Answer;
  return out;
}
export function setAnswers(id: number, a: Answers) {
  const up = 'INSERT INTO answers (candidate_id,code,value) VALUES (?,?,?) ON CONFLICT(candidate_id,code) DO UPDATE SET value=excluded.value';
  for (const [code, v] of Object.entries(a)) run(up, id, code, JSON.stringify(v));
}
export function deleteAnswers(id: number, codes: string[]) {
  for (const c of codes) run('DELETE FROM answers WHERE candidate_id=? AND code=?', id, c);
}

export const getTracks = (id: number) => all<Track>('SELECT * FROM tracks WHERE candidate_id=? ORDER BY position, id', id);
export const getSubject = (id: number) => get<Subject>('SELECT * FROM subjects WHERE candidate_id=?', id);
export const getPhotos = (id: number) => all<Photo>('SELECT * FROM photos WHERE candidate_id=? ORDER BY id', id);
export const getCoach = (id: number | null) => (id ? get<Coach>('SELECT * FROM coaches WHERE id=?', id) : undefined);
export const listCoaches = () => all<Coach & { load: number }>(
  `SELECT c.*, (SELECT COUNT(*) FROM candidates x WHERE x.coach_id=c.id) AS load FROM coaches c ORDER BY c.active DESC, c.name`,
);

export function touchCandidate(id: number, resetReminders = false) {
  run(
    `UPDATE candidates SET updated_at=datetime('now'), last_activity_at=datetime('now')${resetReminders ? ', reminders_sent=0, last_reminder_at=NULL' : ''} WHERE id=?`,
    id,
  );
}

export function setStatus(id: number, newStatus: string, author: string) {
  const c = getCandidate(id);
  if (!c || c.status === newStatus) return;
  run('UPDATE candidates SET status=?, updated_at=datetime(\'now\') WHERE id=?', newStatus, id);
  run('INSERT INTO status_history (candidate_id,old_status,new_status,author) VALUES (?,?,?,?)', id, c.status, newStatus, author);
}

// ---- events / calendar -------------------------------------------------------
export const listEvents = () => all<DevfestEvent & { id: number }>('SELECT * FROM devfest_events ORDER BY event_date IS NULL, event_date, name');

export function eventFor(c: Pick<Candidate, 'city' | 'city_other'>): DevfestEvent | null {
  const key = c.city === 'autre' ? norm(c.city_other ?? '') : (c.city ?? '');
  if (!key) return null;
  const events = listEvents();
  return events.find((e) => e.city === key || norm(e.name) === key) ?? null;
}

export function cityLabel(c: Pick<Candidate, 'city' | 'city_other'>, locale: Locale = 'fr'): string {
  if (c.city === 'autre') return c.city_other || (locale === 'fr' ? 'Autre' : 'Other');
  return c.city ? labelOf(CITIES, c.city, locale) : '—';
}

export function clientIp(h: Headers): string {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
