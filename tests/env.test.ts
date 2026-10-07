import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnv, hasErrors } from '../src/lib/env.ts';

const good = {
  APP_URL: 'https://shespeaks.example.com', DATABASE_URL: 'postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres',
  SESSION_SECRET: 'a'.repeat(32), CRON_SECRET: 'b'.repeat(32), SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service.key',
  ADMIN_EMAIL: 'coach@example.com', RESEND_API_KEY: 're_123456789', MAIL_FROM: 'SheSpeaks <no-reply@example.com>',
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

test('development only requires DATABASE_URL', () => {
  assert.deepEqual(names({}, false), ['error:DATABASE_URL']);
  assert.equal(hasErrors(checkEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }, { production: false })), false);
});

test('issues never contain variable values', () => {
  const secret = 'super-secret-value-123456';
  const text = JSON.stringify(checkEnv({ ...good, SESSION_SECRET: 'x', CRON_SECRET: secret, DATABASE_URL: `https://${secret}` }, { production: true }));
  assert.ok(!text.includes(secret));
});
