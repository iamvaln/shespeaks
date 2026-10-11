// Usage: node --experimental-strip-types scripts/check-env.mjs [--strict]
// On the VPS the `migrate` service runs it before the migrations (NODE_ENV=production): an error stops the deployment and
// the running version keeps serving. On Vercel (VERCEL=1) errors still fail the build. Locally it only prints.
import { checkEnv, formatIssues, hasErrors } from '../src/lib/env.ts';

const production = process.argv.includes('--strict') || !!process.env.VERCEL || process.env.NODE_ENV === 'production';
const strict = production;
const issues = checkEnv(process.env, { production });
console.log(formatIssues(issues));
if (strict && hasErrors(issues) && process.env.SKIP_ENV_CHECK !== 'true') {
  if (process.env.VERCEL_ENV === 'preview') console.error('\nThis is a PREVIEW build: variables scoped to Production only are not available here. In Vercel → Settings → Environment Variables, edit each variable and also tick "Preview".');
  console.error('\nBuild stopped: fix the variables above in the environment file of this deployment (.env.production / .env.preprod on the VPS, Vercel → Settings → Environment Variables on Vercel, or set SKIP_ENV_CHECK=true).');
  process.exit(1);
}
