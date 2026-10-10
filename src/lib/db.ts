// Postgres (Supabase) connection and tiny query helpers. Schema: supabase/migrations/*.sql
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveDatabaseUrl } from './env.ts';

export const STATUSES = [
  { id: 'en_cours', label: 'En cours' },
  { id: 'diagnostic_recu', label: 'Intérêt reçu' },
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

// A query that gets no answer must not hold a page until the platform kills it (60 s on the fiche, then a bare 504): after this delay it fails
// with a clear error and the connection pool is replaced (a stalled connection would otherwise stay in the pool). Both are read at each call.
const queryTimeoutMs = () => Number(process.env.DB_QUERY_TIMEOUT_MS) || 15_000;
const slowQueryMs = () => Number(process.env.DB_SLOW_QUERY_MS) || 2_000;
// A whole transaction, BEGIN and COMMIT included (the library sends those itself, outside exec()): twice the limit of one query.
const transactionTimeoutMs = () => queryTimeoutMs() * 2;
// How long the requests already running on a dropped pool have to finish before its connections are closed.
const RESET_GRACE_S = 5;

export class DbTimeoutError extends Error {
  readonly ms: number; // a plain field: Node runs this file with types stripped, which has no « constructor(public … ) » shorthand
  constructor(ms: number, sqlText: string) {
    super(`The database did not answer within ${ms} ms: ${sqlText.replace(/\s+/g, ' ').slice(0, 80)}`);
    this.name = 'DbTimeoutError';
    this.ms = ms;
  }
}

/**
 * Drops the shared pool so the next query opens fresh connections. The old pool is not cut at once: the other requests of the instance that are
 * running healthy statements get a few seconds to finish (the stalled connection is closed after them). Closing is a half-close, which a peer that
 * has gone silent never answers: nothing may wait for it, which is why callers are released by their own timers (see exec() and tx()).
 */
function resetPool(stalled: Sql): void {
  // the pool the stalled statement ran on, not whatever is current: the grace leaves statements pending on a dropped pool, and their timers
  // must not drop the pool that replaced it
  if (g.__shespeaksSql === stalled) g.__shespeaksSql = undefined;
  stalled.end({ timeout: RESET_GRACE_S }).catch(() => {}); // end() is idempotent: a second call returns the first
}

/**
 * Asks the server to stop a statement nobody waits for any more (a lock it holds, a heavy scan, the CPU it uses). The library's own q.cancel() drops
 * the promise of its cancel connection, which becomes an unhandled rejection if that connection fails: the same function is called here and its promise is caught.
 */
function cancelQuietly(q: unknown): void {
  try {
    const cancelling = (q as { canceller?: (query: unknown) => Promise<unknown> | undefined }).canceller?.(q);
    cancelling?.catch?.(() => {});
  } catch { /* best effort */ }
}

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
const als = new AsyncLocalStorage<{ conn: Sql; pool: Sql }>();
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

/** Runs one statement with the delay above, and logs it when it is slow: the statement text only (never the values), so the Vercel logs say which query stalls. */
async function exec(text: string, p: Param[]) {
  const started = Date.now();
  const inTx = als.getStore();
  const pool = inTx?.pool ?? sql(); // where this statement runs: the pool to replace if it stalls
  const q = (inTx?.conn ?? pool).unsafe(toPg(text), p);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = queryTimeoutMs();
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cancelQuietly(q);
      resetPool(pool);
      console.error(`[db] no answer after ${limit} ms: ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
      reject(new DbTimeoutError(limit, text));
    }, limit);
  });
  try {
    return await Promise.race([q, expired]);
  } finally {
    clearTimeout(timer);
    const took = Date.now() - started;
    if (took >= slowQueryMs() && took < limit) console.warn(`[db] slow query, ${took} ms: ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
}

export async function all<T = Record<string, unknown>>(text: string, ...p: Param[]): Promise<T[]> {
  try {
    return (await exec(text, p)) as unknown as T[];
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
    return (await exec(text, p)).count;
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
  // The caller is released by this promise, not by begin(): after a timeout the library queues a ROLLBACK on the stalled connection and settles
  // only when that socket closes, which a silent peer never does.
  let release!: (e: DbTimeoutError) => void;
  const stalled = new Promise<never>((_, reject) => { release = reject; });
  stalled.catch(() => {}); // nobody may see it as unhandled when the transaction wins
  const pool = sql();
  const running = pool.begin((t) => als.run({ conn: t as unknown as Sql, pool }, async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DbTimeoutError) release(e); // the cause, not the error of the rollback that follows
      throw e;
    }
  }));
  const limit = transactionTimeoutMs();
  const deadline = setTimeout(() => {
    resetPool(pool);
    console.error(`[db] a transaction did not finish within ${limit} ms`);
    release(new DbTimeoutError(limit, 'transaction (BEGIN, COMMIT or a statement)'));
  }, limit);
  try {
    return (await Promise.race([running, stalled])) as T;
  } finally {
    clearTimeout(deadline);
    running.catch(() => {}); // a rollback that ends in an error, or never ends, is not the caller's business
  }
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
