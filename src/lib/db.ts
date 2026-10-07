// Postgres (Supabase) connection and tiny query helpers. Schema: supabase/migrations/*.sql
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveDatabaseUrl } from './env.ts';

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

type Sql = postgres.Sql;
const g = globalThis as unknown as { __shespeaksSql?: Sql };

/** One shared client per server instance. Use Supabase's *transaction pooler* URL on Vercel (port 6543). */
export function sql(): Sql {
  if (!g.__shespeaksSql) {
    const url = resolveDatabaseUrl(process.env);
    if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL) is not set');
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__shespeaksSql = postgres(url, {
      max: 3,
      prepare: false, // required behind pgbouncer / Supabase pooler
      ssl: local ? false : 'require',
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      // keep timestamps as 'YYYY-MM-DD HH:MM:SS' UTC strings (the app treats them as text)
      types: { ts: { to: 1114, from: [1114], serialize: (x: unknown) => String(x), parse: (x: string) => x.slice(0, 19) } },
    });
  }
  return g.__shespeaksSql;
}

// Statements inside tx() automatically run on the transaction's connection.
const als = new AsyncLocalStorage<Sql>();
const conn = (): Sql => als.getStore() ?? sql();
const toPg = (text: string) => {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
};

type Param = string | number | null;

/** Turn "table/column does not exist" into something an operator reading the Vercel logs can act on. */
function explain(e: unknown): unknown {
  const code = (e as { code?: string })?.code;
  if (code === '42P01' || code === '42703') {
    const err = new Error(
      `Database schema is missing or out of date (${(e as Error).message}). Apply the migrations: run "npm run db:setup" ` +
        'against this database, or redeploy on Vercel (migrations run during the build unless MIGRATE_ON_BUILD=false).',
    );
    (err as Error & { cause?: unknown }).cause = e;
    return err;
  }
  return e;
}

export async function all<T = Record<string, unknown>>(text: string, ...p: Param[]): Promise<T[]> {
  try {
    return (await conn().unsafe(toPg(text), p)) as unknown as T[];
  } catch (e) {
    throw explain(e);
  }
}
export async function get<T = Record<string, unknown>>(text: string, ...p: Param[]): Promise<T | undefined> {
  return (await all<T>(text, ...p))[0];
}
/** Returns the number of affected rows. */
export async function run(text: string, ...p: Param[]): Promise<number> {
  try {
    return (await conn().unsafe(toPg(text), p)).count;
  } catch (e) {
    throw explain(e);
  }
}
/** INSERT … returning the new row id. */
export async function insert(text: string, ...p: Param[]): Promise<number> {
  const r = await all<{ id: number }>(`${text} RETURNING id`, ...p);
  return r[0].id;
}

export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn(); // already inside a transaction
  return (await sql().begin((t) => als.run(t as unknown as Sql, fn))) as T;
}

export const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC

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

export async function getSetting(key: SettingKey): Promise<string> {
  const r = await get<{ value: string }>('SELECT value FROM settings WHERE key=?', key);
  return r ? r.value : SETTING_DEFAULTS[key];
}
export async function setSetting(key: SettingKey, value: string) {
  await run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}
