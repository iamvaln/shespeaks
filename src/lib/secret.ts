// Server secret used to sign sessions and to derive opaque rate-limit keys.
export function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s !== 'change-me') return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  return 'dev-only-secret';
}
