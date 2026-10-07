// Runs once when the server starts (not during `next build`).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { checkEnv, formatIssues, hasErrors } = await import('./lib/env.ts');
  const production = process.env.NODE_ENV === 'production';
  const issues = checkEnv(process.env, { production });
  if (issues.length) console[hasErrors(issues) ? 'error' : 'warn'](formatIssues(issues));
  // Fail loudly rather than serve a half-configured site. Escape hatch: SKIP_ENV_CHECK=true.
  if (production && hasErrors(issues) && process.env.SKIP_ENV_CHECK !== 'true') {
    throw new Error('SheSpeaks cannot start: fix the environment variables above (or set SKIP_ENV_CHECK=true to override).');
  }
}
