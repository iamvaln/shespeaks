// Usage: node --experimental-strip-types scripts/check-env.mjs [--strict]
// Runs automatically before `next build` (see "prebuild"). On Vercel (VERCEL=1) errors fail the build,
// so a missing variable is caught at deploy time instead of in front of candidates. Locally it only prints.
import { checkEnv, formatIssues, hasErrors } from '../src/lib/env.ts';

const strict = process.argv.includes('--strict') || !!process.env.VERCEL;
const issues = checkEnv(process.env, { production: !!process.env.VERCEL || process.argv.includes('--strict') });
console.log(formatIssues(issues));
if (strict && hasErrors(issues) && process.env.SKIP_ENV_CHECK !== 'true') {
  console.error('\nBuild stopped: fix the variables above in Vercel → Project Settings → Environment Variables (or set SKIP_ENV_CHECK=true).');
  process.exit(1);
}
