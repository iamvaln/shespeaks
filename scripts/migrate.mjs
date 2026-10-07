// Apply supabase/migrations/*.sql (idempotent) and bootstrap the first coach.
// Usage: DATABASE_URL=postgres://... ADMIN_EMAIL=you@x.com node scripts/migrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }
const local = /localhost|127\.0\.0\.1/.test(url);
const sql = postgres(url, { max: 1, prepare: false, ssl: local ? false : 'require', onnotice: () => {} });
const dir = path.resolve('supabase/migrations');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  await sql.unsafe(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log('applied', f);
}
const [{ n }] = await sql`select count(*)::int as n from coaches`;
if (n === 0 && process.env.ADMIN_EMAIL) {
  await sql`insert into coaches (name,email) values (${process.env.ADMIN_NAME || 'Coach'}, ${process.env.ADMIN_EMAIL.trim().toLowerCase()})`;
  console.log('created first coach', process.env.ADMIN_EMAIL);
}
await sql.end();
