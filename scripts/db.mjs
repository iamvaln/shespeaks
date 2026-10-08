// Database CLI: tracked migrations + idempotent seeding. Works against any Postgres (Supabase, local, CI).
//
//   node scripts/db.mjs migrate   apply pending supabase/migrations/NNNN_name.sql, in order, each in its own transaction
//   node scripts/db.mjs seed      load reference data (never overwrites what coaches edited) + first coach from ADMIN_EMAIL
//   node scripts/db.mjs setup     migrate + seed
//   node scripts/db.mjs status    list applied / pending migrations (exit 1 if a file changed after being applied)
//   node scripts/db.mjs deploy    what `npm run build` runs on Vercel: setup, honouring MIGRATE_ON_BUILD
//
// Connection: DATABASE_URL or POSTGRES_URL (Supabase integration). Use the pooled (6543) string; it works for DDL too.
// Rules that make this safe on Vercel (parallel builds, shared DB): every migration runs inside a transaction that
// first takes a Postgres advisory lock, so two builds can never apply the same file twice or interleave.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../src/lib/env.ts';

const LOCK_ID = 727265001; // arbitrary constant shared by every process that migrates this database
const DIR = path.resolve(process.env.MIGRATIONS_DIR || 'supabase/migrations');
const NAME_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

const log = (m) => console.log(`[db] ${m}`);
const fail = (m) => { console.error(`[db] ERROR ${m}`); process.exitCode = 1; };

function connect() {
  // MIGRATE_DATABASE_URL: optional override for migrations only (e.g. a session-mode / direct connection), if the pooler ever misbehaves for DDL.
  const url = resolveDatabaseUrl({ DATABASE_URL: process.env.MIGRATE_DATABASE_URL, POSTGRES_URL: undefined }) ?? resolveDatabaseUrl(process.env);
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL) is not set');
  const local = /localhost|127\.0\.0\.[0-9]/.test(url);
  return postgres(url, { max: 1, prepare: false, ssl: local ? false : 'require', onnotice: () => {}, connect_timeout: 20 });
}

function files() {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const bad = all.filter((f) => !NAME_RE.test(f));
  if (bad.length) throw new Error(`Migration files must be named NNNN_description.sql (lowercase): ${bad.join(', ')}`);
  return all.map((name) => {
    const text = fs.readFileSync(path.join(DIR, name), 'utf8').replace(/\r\n/g, '\n'); // checkout-independent checksum
    return { name, text, checksum: crypto.createHash('sha256').update(text).digest('hex') };
  });
}

async function ensureTable(sql) {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`; // CREATE TABLE IF NOT EXISTS itself races when run concurrently
    await tx.unsafe(`create table if not exists schema_migrations (
      filename text primary key, checksum text not null, applied_at timestamp not null default (now() at time zone 'utc'));
      alter table schema_migrations enable row level security;`);
  });
}

async function status(sql) {
  await ensureTable(sql);
  const rows = await sql`select filename, checksum, applied_at from schema_migrations order by filename`;
  const applied = new Map(rows.map((r) => [r.filename, r]));
  const onDisk = files();
  const pending = onDisk.filter((f) => !applied.has(f.name));
  const changed = onDisk.filter((f) => applied.has(f.name) && applied.get(f.name).checksum !== f.checksum);
  const orphaned = rows.filter((r) => !onDisk.some((f) => f.name === r.filename)).map((r) => r.filename);
  return { onDisk, applied, pending, changed, orphaned };
}

async function migrate(sql) {
  const st = await status(sql);
  if (st.changed.length) {
    throw new Error(`These migrations were edited after being applied: ${st.changed.map((f) => f.name).join(', ')}. ` +
      'Never edit an applied migration: add a new numbered file instead (git revert the edit).');
  }
  if (st.orphaned.length) log(`warning: recorded in the database but missing from the repo: ${st.orphaned.join(', ')}`);
  if (!st.pending.length) { log(`migrations: nothing to apply (${st.applied.size} already applied)`); return 0; }
  let n = 0;
  for (const f of st.pending) {
    const t0 = Date.now();
    const did = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
      const [{ done }] = await tx`select exists(select 1 from schema_migrations where filename=${f.name}) as done`;
      if (done) return false; // another process applied it while we waited for the lock
      await tx.unsafe(f.text);
      await tx`insert into schema_migrations (filename, checksum) values (${f.name}, ${f.checksum})`;
      return true;
    });
    log(did ? `applied ${f.name} (${Date.now() - t0} ms)` : `skipped ${f.name} (applied concurrently)`);
    n += did ? 1 : 0;
  }
  return n;
}

// Reference data. `on conflict do nothing` => safe to run on every deploy, never overwrites a coach's edits.
const EVENTS = [
  // [slug, city, title, cfp close, cfp note, event date, venue, submission url, submission label, poster]
  ['yaounde', 'Yaoundé', 'DevFest Yaoundé 2026', '2026-10-31', 'à 23 h 59 (heure de Yaoundé)', '2026-11-21', null, 'https://devfest.gdgyaounde.com/speakers', 'devfest.gdgyaounde.com/speakers (Sessionize)', '/events/devfest-yaounde-2026.jpg'],
  ['douala', 'Douala', 'DevFest Douala 2026', '2026-11-01', 'heure non précisée', '2026-11-28', 'Majestic Cinéma', 'https://bit.ly/speakersdevfest26', 'bit.ly/speakersdevfest26 (devfest.gdgdouala.org/cfp)', '/events/devfest-douala-2026.jpg'],
  ['bamenda', 'Bamenda', 'DevFest Bamenda 2026', null, null, null, null, null, null, null], // dates to confirm: coaches fill them in Admin → Événements
];

async function seed(sql) {
  let events = 0;
  for (const e of EVENTS) {
    // New rows are inserted; existing rows keep every value a coach may have edited (only empty titles are filled).
    // Posters of existing events come from migration 0004, so removing one in the admin is not undone on the next deploy.
    const inserted = await sql`insert into devfest_events (city,name,title,cfp_close_date,cfp_close_note,event_date,venue,submission_url,submission_label,poster_url)
      values (${e[0]},${e[1]},${e[2]},${e[3]},${e[4]},${e[5]},${e[6]},${e[7]},${e[8]},${e[9]})
      on conflict (city) do update set title = coalesce(devfest_events.title, excluded.title)
      returning (xmax = 0) as is_new`;
    events += inserted[0]?.is_new ? 1 : 0;
  }
  log(`seed: events (${events} added, ${EVENTS.length - events} already present, left untouched)`);
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const [{ n }] = await sql`select count(*)::int as n from coaches`;
  if (n === 0 && admin) {
    await sql`insert into coaches (name,email) values (${process.env.ADMIN_NAME || 'Coach'}, ${admin}) on conflict (email) do nothing`;
    log(`seed: first coach created (${admin})`);
  } else {
    log(n > 0 ? `seed: coaches already exist (${n}), first coach not touched` : 'seed: ADMIN_EMAIL not set, no first coach created (the first login with ADMIN_EMAIL creates her)');
  }
}

function deployAllowed() {
  if (!process.env.VERCEL) return 'not on Vercel (use `npm run db:setup` locally)';
  const mode = (process.env.MIGRATE_ON_BUILD ?? 'all').toLowerCase();
  if (mode === 'false' || mode === 'off') return 'MIGRATE_ON_BUILD=false';
  if (mode === 'production' && process.env.VERCEL_ENV !== 'production') return `MIGRATE_ON_BUILD=production and this is a ${process.env.VERCEL_ENV} build`;
  return null;
}

const HELP = 'usage: node scripts/db.mjs <migrate|seed|setup|status|deploy>';
const cmd = process.argv[2];
if (!['migrate', 'seed', 'setup', 'status', 'deploy'].includes(cmd)) { console.log(HELP); process.exit(cmd ? 1 : 0); }

let sql;
try {
  if (cmd === 'deploy') {
    const why = deployAllowed();
    if (why) { log(`deploy: skipped, ${why}`); process.exit(0); }
  }
  sql = connect();
  if (cmd === 'status') {
    const st = await status(sql);
    for (const f of st.onDisk) log(`${st.applied.has(f.name) ? (st.changed.includes(f) ? 'CHANGED ' : 'applied ') : 'pending '} ${f.name}`);
    if (st.changed.length) fail('applied migrations were edited (see CHANGED)');
    else log(`${st.applied.size} applied, ${st.pending.length} pending`);
  } else {
    if (cmd === 'migrate' || cmd === 'setup' || cmd === 'deploy') await migrate(sql);
    if (cmd === 'seed' || cmd === 'setup' || cmd === 'deploy') await seed(sql);
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
