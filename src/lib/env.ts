// Environment sanity check. Pure (no framework imports) so the same rules run at server start,
// at build time on Vercel (scripts/check-env.mjs), in the admin status panel, and in tests.
// It only ever reports variable NAMES, never their values.

export type EnvLevel = 'error' | 'warn';
export interface EnvIssue {
  level: EnvLevel;
  vars: string[];
  message: string;
}
type Env = Record<string, string | undefined>;

/**
 * Database URL: DATABASE_URL, or POSTGRES_URL (the pooled URL created by Vercel's Supabase integration).
 * The integration appends non-standard parameters (`supa=base-pooler.x`) that the driver would forward to
 * Postgres as settings, which makes every connection fail, so they are stripped.
 */
export function resolveDatabaseUrl(env: Env): string | undefined {
  const raw = (env.DATABASE_URL || env.POSTGRES_URL)?.trim();
  if (!raw) return undefined;
  const q = raw.indexOf('?');
  if (q < 0) return raw;
  const params = raw.slice(q + 1).split('&').filter((p) => p && !/^(supa|pgbouncer)=/i.test(p));
  return params.length ? `${raw.slice(0, q)}?${params.join('&')}` : raw.slice(0, q);
}

/** Public site URL: APP_URL, else the URL Vercel provides (production domain, then deployment URL), else localhost. */
export function resolveAppUrl(env: Env): { url: string; source: 'APP_URL' | 'vercel' | 'default' } {
  const set = env.APP_URL?.trim();
  if (set && !/^(change-?me|your[-_ ].*)$/i.test(set)) return { url: set.replace(/\/$/, ''), source: 'APP_URL' };
  const host = (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) || env.VERCEL_URL;
  if (host) return { url: `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, source: 'vercel' };
  return { url: 'http://localhost:3000', source: 'default' };
}

const PLACEHOLDER = /^(change-?me|changeme|xxx+|your[-_ ].*|\[.*\])?$/i;
const isSet = (v: string | undefined) => !!v && !PLACEHOLDER.test(v.trim());

export function checkEnv(env: Env, opts: { production: boolean }): EnvIssue[] {
  const out: EnvIssue[] = [];
  const add = (level: EnvLevel, vars: string[], message: string) => out.push({ level, vars, message });
  const onVercel = !!env.VERCEL;

  // --- database: needed everywhere ---------------------------------------------
  const db = resolveDatabaseUrl(env);
  if (!db) add('error', ['DATABASE_URL'], 'Missing. Set DATABASE_URL (or let the Supabase integration provide POSTGRES_URL): the Transaction pooler string, port 6543.');
  else if (!/^postgres(ql)?:\/\//i.test(db)) add('error', ['DATABASE_URL'], 'Must start with postgresql:// (check you copied the connection string, not the project URL).');
  else if (/\[YOUR-PASSWORD\]|\[PASSWORD\]/i.test(db)) add('error', ['DATABASE_URL'], 'Still contains the [YOUR-PASSWORD] placeholder.');
  else if (onVercel && !/:6543\b/.test(db)) {
    add('warn', ['DATABASE_URL'], 'On Vercel, use the Supabase Transaction pooler (port 6543); direct connections (5432) exhaust connections under serverless.');
  }

  if (!opts.production) return out; // everything below only matters when real users are involved

  // --- public URL ------------------------------------------------------------------
  const app = resolveAppUrl(env);
  if (app.source === 'default') add('error', ['APP_URL'], 'Missing. Links in emails (resume, coach login) would point to localhost.');
  else if (/localhost|127\.0\.0\.1/.test(app.url)) add('error', ['APP_URL'], 'Points to localhost in production: emailed links would not work for candidates.');
  else if (app.source === 'vercel') add('warn', ['APP_URL'], `Not set: emailed links will use ${app.url}. Set APP_URL to your real domain.`);
  else if (!/^https:\/\//i.test(app.url)) add('warn', ['APP_URL'], 'Should start with https://.');

  // --- secrets -----------------------------------------------------------------------
  if (!isSet(env.SESSION_SECRET)) add('error', ['SESSION_SECRET'], 'Missing or still "change-me". Generate one: openssl rand -hex 32');
  else if ((env.SESSION_SECRET ?? '').length < 16) add('error', ['SESSION_SECRET'], 'Too short (use at least 16 characters, ideally 32+ random bytes in hex).');
  if (!isSet(env.CRON_SECRET)) add('error', ['CRON_SECRET'], 'Missing or still "change-me": the reminder cron endpoint refuses to run, so no reminders would ever be sent.');

  // --- photo storage -----------------------------------------------------------------
  const sbUrl = isSet(env.SUPABASE_URL);
  const sbKey = isSet(env.SUPABASE_SERVICE_ROLE_KEY);
  if (sbUrl !== sbKey) {
    add('error', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Set both or neither: one is missing, so photo uploads would break.');
  } else if (!sbUrl) {
    if (onVercel) add('error', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Missing. Vercel has no persistent disk, so speaker photos cannot be stored.');
    else add('warn', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Not set: photos are written to the local disk (DATA_DIR), which is not durable on most hosts.');
  } else if (!/^https:\/\/.+/i.test(env.SUPABASE_URL!.trim())) {
    add('error', ['SUPABASE_URL'], 'Must be the project URL, e.g. https://xxxx.supabase.co');
  }

  // --- first coach -------------------------------------------------------------------
  if (!isSet(env.ADMIN_EMAIL)) add('warn', ['ADMIN_EMAIL'], 'Not set: if no coach exists yet, nobody can log in to the admin. (Ignore once a coach has been created.)');

  // --- email (Resend) -------------------------------------------------------------------
  if (!isSet(env.RESEND_API_KEY)) {
    add('warn', ['RESEND_API_KEY'], 'Not set: confirmations, reminders and coach notifications are only recorded in Admin → Emails, never sent. Coach login links will not be delivered.');
  } else {
    if (!/^re_/.test(env.RESEND_API_KEY!.trim())) add('error', ['RESEND_API_KEY'], 'Resend API keys start with "re_" (Resend dashboard → API Keys).');
    const from = env.MAIL_FROM?.trim();
    const addr = from ? (/<([^>]+)>/.exec(from)?.[1] ?? from).trim() : '';
    if (!from) add('error', ['MAIL_FROM'], 'Required with Resend: a sender on a domain you verified in Resend, e.g. "SheSpeaks <no-reply@yourdomain.com>".');
    else if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(addr)) add('error', ['MAIL_FROM'], 'Not a valid sender address. Expected: SheSpeaks <no-reply@yourdomain.com>');
    else if (/@resend\.dev$/i.test(addr)) add('warn', ['MAIL_FROM'], 'resend.dev is Resend\'s test sender: it can only deliver to the email of your own Resend account. Verify your domain and use it here.');
    if (env.MAIL_REPLY_TO?.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test((/<([^>]+)>/.exec(env.MAIL_REPLY_TO)?.[1] ?? env.MAIL_REPLY_TO).trim())) {
      add('warn', ['MAIL_REPLY_TO'], 'Not a valid address; replies would not reach a coach.');
    }
  }
  return out;
}

export const hasErrors = (issues: EnvIssue[]) => issues.some((i) => i.level === 'error');

export function formatIssues(issues: EnvIssue[]): string {
  if (!issues.length) return 'Environment check: all good.';
  return [
    'Environment check:',
    ...issues.map((i) => `  ${i.level === 'error' ? '✖ ERROR' : '⚠ warn '}  ${i.vars.join(' + ')} — ${i.message}`),
  ].join('\n');
}
