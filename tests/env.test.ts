import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnv, hasErrors, databaseSsl } from '../src/lib/env.ts';

const good = {
  APP_URL: 'https://shespeaks.example.com', DATABASE_URL: 'postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres',
  SESSION_SECRET: 'a'.repeat(32), CRON_SECRET: 'b'.repeat(32), SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service.key',
  ADMIN_EMAIL: 'coach@example.com', RESEND_API_KEY: 're_123456789', MAIL_FROM: 'SheSpeaks <no-reply@example.com>',
  ANTHROPIC_API_KEY: 'sk-ant-api03-abcdef123456',
};
const names = (env: Record<string, string | undefined>, production = true) => checkEnv(env, { production }).map((i) => `${i.level}:${i.vars.join('+')}`);

test('a complete production config has no issues', () => {
  assert.deepEqual(checkEnv({ ...good, VERCEL: '1' }, { production: true }), []);
});

test('empty production env reports every required variable as an error', () => {
  const n = names({ VERCEL: '1' });
  for (const v of ['DATABASE_URL', 'APP_URL', 'SESSION_SECRET', 'CRON_SECRET', 'SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY']) assert.ok(n.includes(`error:${v}`), v);
  assert.ok(n.includes('warn:RESEND_API_KEY') && n.includes('warn:ADMIN_EMAIL'));
});

test('placeholders and localhost are rejected in production', () => {
  const n = names({ ...good, SESSION_SECRET: 'change-me', CRON_SECRET: 'change-me', APP_URL: 'http://localhost:3000' });
  assert.deepEqual(n.filter((x) => x.startsWith('error')).sort(), ['error:APP_URL', 'error:CRON_SECRET', 'error:SESSION_SECRET']);
});

test('database URL must be postgres, without placeholder; pooler port advised on Vercel', () => {
  assert.ok(names({ ...good, DATABASE_URL: 'https://x.supabase.co' }).includes('error:DATABASE_URL'));
  assert.ok(names({ ...good, DATABASE_URL: 'postgresql://postgres:[YOUR-PASSWORD]@h:6543/postgres' }).includes('error:DATABASE_URL'));
  assert.ok(names({ ...good, VERCEL: '1', DATABASE_URL: 'postgresql://u:p@db.x.supabase.co:5432/postgres' }).includes('warn:DATABASE_URL'));
});

test('supabase storage: both or neither; neither is an error only on Vercel', () => {
  assert.ok(names({ ...good, SUPABASE_URL: undefined }).includes('error:SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY'));
  const neither = { ...good, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined };
  assert.ok(names(neither).includes('warn:SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(names({ ...neither, VERCEL: '1' }).includes('error:SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY'));
});

test('resend: missing key warns; bad key, missing/invalid/test sender are flagged', () => {
  assert.ok(names({ ...good, RESEND_API_KEY: undefined }).includes('warn:RESEND_API_KEY'));
  assert.ok(names({ ...good, RESEND_API_KEY: 'sk_live_nope' }).includes('error:RESEND_API_KEY'));
  assert.ok(names({ ...good, MAIL_FROM: undefined }).includes('error:MAIL_FROM'));
  assert.ok(names({ ...good, MAIL_FROM: 'not an address' }).includes('error:MAIL_FROM'));
  assert.ok(names({ ...good, MAIL_FROM: 'SheSpeaks <onboarding@resend.dev>' }).includes('warn:MAIL_FROM'));
  assert.ok(names({ ...good, MAIL_FROM: 'no-reply@example.com' }).length === 0, 'bare address accepted');
  assert.ok(names({ ...good, MAIL_REPLY_TO: 'nope' }).includes('warn:MAIL_REPLY_TO'));
});

test('AI suggestions: the key is optional (a warning, never an error) and must look like an Anthropic key', () => {
  assert.deepEqual(names({ ...good, ANTHROPIC_API_KEY: undefined }), ['warn:ANTHROPIC_API_KEY']);
  assert.deepEqual(names({ ...good, ANTHROPIC_API_KEY: 'change-me' }), ['warn:ANTHROPIC_API_KEY'], 'a placeholder counts as unset');
  assert.deepEqual(names({ ...good, ANTHROPIC_API_KEY: 'sk-live-nope' }), ['warn:ANTHROPIC_API_KEY']);
  assert.equal(hasErrors(checkEnv({ ...good, ANTHROPIC_API_KEY: undefined, VERCEL: '1' }, { production: true })), false);
});

test('development only requires DATABASE_URL', () => {
  assert.deepEqual(names({}, false), ['error:DATABASE_URL']);
  assert.equal(hasErrors(checkEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }, { production: false })), false);
});

test('issues never contain variable values', () => {
  const secret = 'super-secret-value-123456';
  const text = JSON.stringify(checkEnv({ ...good, SESSION_SECRET: 'x', CRON_SECRET: secret, DATABASE_URL: `https://${secret}` }, { production: true }));
  assert.ok(!text.includes(secret));
});

import { resolveAppUrl, resolveDatabaseUrl } from '../src/lib/env.ts';

test('Vercel Supabase integration: POSTGRES_URL is accepted and non-standard params are stripped', () => {
  const pg = 'postgres://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x';
  assert.equal(resolveDatabaseUrl({ POSTGRES_URL: pg }), 'postgres://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require');
  assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://u:p@h:6543/db?supa=base-pooler.x' }), 'postgres://u:p@h:6543/db');
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://own', POSTGRES_URL: pg }), 'postgres://own', 'DATABASE_URL wins');
  assert.equal(resolveDatabaseUrl({}), undefined);
});

test('APP_URL falls back to the URL Vercel provides', () => {
  assert.deepEqual(resolveAppUrl({ APP_URL: 'https://shespeaks.org/' }), { url: 'https://shespeaks.org', source: 'APP_URL' });
  assert.deepEqual(resolveAppUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'shespeaks.vercel.app', VERCEL_URL: 'x-123.vercel.app' }), { url: 'https://shespeaks.vercel.app', source: 'vercel' });
  assert.deepEqual(resolveAppUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'x-123.vercel.app' }), { url: 'https://x-123.vercel.app', source: 'vercel' });
  assert.equal(resolveAppUrl({}).source, 'default');
});

test('the variables from the real Vercel project: the two secrets are missing, the optional AI key is only a warning', () => {
  const vercelProject = {
    VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'shespeaks.vercel.app',
    POSTGRES_URL: 'postgres://postgres.abc:pw@aws-0.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x',
    SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service', ADMIN_EMAIL: 'v@example.com', ADMIN_NAME: 'V',
    RESEND_API_KEY: 're_abc123', MAIL_FROM: 'SheSpeaks <no-reply@example.com>',
  };
  assert.deepEqual(names(vercelProject).sort(), ['error:CRON_SECRET', 'error:SESSION_SECRET', 'warn:ANTHROPIC_API_KEY', 'warn:APP_URL']);
  const complete = { ...vercelProject, SESSION_SECRET: 'a'.repeat(32), CRON_SECRET: 'b'.repeat(32), APP_URL: 'https://shespeaks.org' };
  assert.deepEqual(names(complete), ['warn:ANTHROPIC_API_KEY'], 'without the key the AI suggestions are simply off');
  assert.deepEqual(names({ ...complete, ANTHROPIC_API_KEY: 'sk-ant-api03-abcdef' }), []);
  assert.deepEqual(names({ ...complete, ANTHROPIC_API_KEY: 'abcdef' }), ['warn:ANTHROPIC_API_KEY'], 'a key that does not look like Anthropic\'s');
});

test('messages shown in the coach space are in French', () => {
  const every = checkEnv({ VERCEL: '1', APP_URL: 'http://localhost:3000', DATABASE_URL: 'https://x', RESEND_API_KEY: 'nope', MAIL_FROM: 'bad', MAIL_REPLY_TO: 'bad' }, { production: true });
  assert.ok(every.length >= 8);
  for (const i of every) assert.doesNotMatch(i.message, /\b(Missing|Not set|Must|Should|Required|the|your|would)\b/, i.message);
});

test('database SSL follows sslmode in the URL, else off only for a local host', () => {
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks?sslmode=disable'), false);
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks?sslmode=require'), 'require');
  assert.equal(databaseSsl('postgresql://u:p@h:5432/x?application_name=a&sslmode=verify-full'), 'verify-full');
  assert.equal(databaseSsl('postgres://shespeaks:shespeaks@localhost:5432/shespeaks'), false);
  assert.equal(databaseSsl('postgres://u:p@127.0.0.1:5432/x'), false);
  assert.equal(databaseSsl('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'), 'require');
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks'), 'require', 'no sslmode on a remote-looking host keeps today\'s behaviour');
});
