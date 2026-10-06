// SQLite (node:sqlite) connection, schema and seed. One file DB under DATA_DIR.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

export const STATUSES = [
  { id: 'en_cours', label: 'En cours' },
  { id: 'diagnostic_recu', label: 'Diagnostic reçu' },
  { id: 'sujet_valide', label: 'Sujet validé' },
  { id: 'candidature_soumise', label: 'Candidature soumise' },
  { id: 'retenue', label: 'Retenue' },
  { id: 'non_retenue', label: 'Non retenue' },
  { id: 'slides_validees', label: 'Slides validées' },
  { id: 'repetition_faite', label: 'Répétition faite' },
  { id: 'jour_j', label: 'Jour J' },
] as const;
export type StatusId = (typeof STATUSES)[number]['id'];
export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS coaches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  name TEXT, city TEXT, city_other TEXT, whatsapp TEXT, email TEXT,
  locale TEXT NOT NULL DEFAULT 'fr',
  talk_language TEXT, role TEXT, seniority TEXT,
  branch TEXT,
  status TEXT NOT NULL DEFAULT 'en_cours',
  coach_id INTEGER REFERENCES coaches(id),
  current_screen TEXT NOT NULL DEFAULT 'profile',
  consent_photo INTEGER NOT NULL DEFAULT 0,
  selected_photo_id INTEGER,
  next_point_date TEXT,
  completed_at TEXT,
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cand_status ON candidates(status);
CREATE TABLE IF NOT EXISTS answers (
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  value TEXT NOT NULL,            -- JSON
  PRIMARY KEY (candidate_id, code)
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL, angle TEXT, format TEXT, domain TEXT, hook TEXT,
  origin TEXT NOT NULL DEFAULT 'croisement',   -- personnelle | croisement | coach
  state TEXT NOT NULL DEFAULT 'generee',       -- generee | retenue_coach | ecartee | choisie
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS subjects (
  candidate_id INTEGER PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT, abstract TEXT, audience TEXT, format TEXT,
  application_state TEXT NOT NULL DEFAULT 'a_soumettre',
  abstract_edited INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS review_items (
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  result TEXT NOT NULL,           -- ok | a_revoir | coche | non_coche
  value TEXT,
  PRIMARY KEY (candidate_id, criterion)
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  old_status TEXT, new_status TEXT NOT NULL, author TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  coach_id INTEGER REFERENCES coaches(id),
  text TEXT NOT NULL, next_point_date TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  width INTEGER, height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS devfest_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL UNIQUE,      -- slug: douala, yaounde, bamenda, ...
  name TEXT NOT NULL,
  cfp_close_date TEXT, cfp_close_note TEXT,
  event_date TEXT, venue TEXT,
  submission_url TEXT, submission_label TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY, coach_id INTEGER NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body_text TEXT NOT NULL,
  status TEXT NOT NULL,           -- sent | logged | failed
  error TEXT, candidate_id INTEGER,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SEED_EVENTS = [
  {
    city: 'yaounde', name: 'Yaoundé', cfp_close_date: '2026-10-31', cfp_close_note: 'à 23 h 59 (heure de Yaoundé)',
    event_date: '2026-11-21', venue: null, submission_url: 'https://devfest.gdgyaounde.com/speakers',
    submission_label: 'Sessionize, via devfest.gdgyaounde.com/speakers',
  },
  {
    city: 'douala', name: 'Douala', cfp_close_date: '2026-11-01', cfp_close_note: 'heure non précisée',
    event_date: '2026-11-28', venue: 'Majestic Cinéma', submission_url: 'https://devfest.gdgdouala.org/cfp',
    submission_label: 'devfest.gdgdouala.org/cfp (affiche : bit.ly/speakersdevfest26)',
  },
  { city: 'bamenda', name: 'Bamenda', cfp_close_date: null, cfp_close_note: null, event_date: null, venue: null, submission_url: null, submission_label: null },
];

function init(db: DatabaseSync) {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const ev = db.prepare(
    `INSERT OR IGNORE INTO devfest_events (city,name,cfp_close_date,cfp_close_note,event_date,venue,submission_url,submission_label)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const e of SEED_EVENTS) ev.run(e.city, e.name, e.cfp_close_date, e.cfp_close_note, e.event_date, e.venue, e.submission_url, e.submission_label);
  // Bootstrap the first coach from the environment.
  const n = (db.prepare('SELECT COUNT(*) c FROM coaches').get() as { c: number }).c;
  if (n === 0 && process.env.ADMIN_EMAIL) {
    db.prepare('INSERT INTO coaches (name,email) VALUES (?,?)').run(process.env.ADMIN_NAME || 'Coach', process.env.ADMIN_EMAIL.trim().toLowerCase());
  }
}

const g = globalThis as unknown as { __shespeaksDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__shespeaksDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const d = new DatabaseSync(path.join(DATA_DIR, 'shespeaks.db'));
    init(d);
    g.__shespeaksDb = d;
  }
  return g.__shespeaksDb;
}

// ---- small typed helpers -------------------------------------------------
type Param = string | number | null | bigint | Uint8Array;
export const all = <T = Record<string, unknown>>(sql: string, ...p: Param[]): T[] => db().prepare(sql).all(...p) as T[];
export const get = <T = Record<string, unknown>>(sql: string, ...p: Param[]): T | undefined => db().prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: Param[]) => db().prepare(sql).run(...p);

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC, same format as datetime('now')

// ---- settings --------------------------------------------------------------
export const SETTING_DEFAULTS = {
  notification_email: '',
  internal_deadline: '2026-10-26',
  show_tracks_to_candidates: 'false',
  reminders_enabled: 'true',
  reminder_first_hours: '24',
  reminder_interval_hours: '48',
  reminder_max: '2',
  domains: '',
  angles: '',
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export function getSetting(key: SettingKey): string {
  const r = get<{ value: string }>('SELECT value FROM settings WHERE key=?', key);
  return r ? r.value : SETTING_DEFAULTS[key];
}
export function setSetting(key: SettingKey, value: string) {
  run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}
