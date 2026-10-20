// Calendar-day arithmetic for the coach space. Pure (no framework imports), so it is unit-tested.

/** The programme runs in Cameroon: dates and times are shown in this zone. */
export const TIME_ZONE = 'Africa/Douala';

/** Today's date (YYYY-MM-DD) in the programme's time zone. */
export const todayIso = (now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);

/** Whole calendar days from `today` to `iso` (both YYYY-MM-DD): 0 = today, negative = past. */
export const daysUntil = (iso: string | null | undefined, today: string): number | null =>
  iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;

/** « J-3 » (« J-0 » on the day itself), or the given word once the day has passed. */
export const countdown = (days: number, past: string): string => (days >= 0 ? `J-${days}` : past);

/** A real calendar day written YYYY-MM-DD, or null (absent, free text, impossible date such as 2026-02-31). */
export const isoOrNull = (x: unknown): string | null => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const t = Date.parse(`${x}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== x ? null : x;
};

/** `iso` moved by `n` calendar days (n may be negative). */
export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The programme's day of a database timestamp (UTC, « YYYY-MM-DD HH:MM:SS »): 23:30 UTC is already the next day in Douala. */
export const dayOf = (ts: string | null | undefined): string | null => {
  if (!ts) return null;
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts.replace(' ', 'T') : `${ts.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : todayIso(new Date(ms));
};

/** The database timestamp (UTC, « YYYY-MM-DD HH:MM:SS ») at which the programme's day `today` begins: 00:00 in Douala is 23:00 UTC the day before. */
export const dayStartUtc = (today: string): string => {
  const guess = Date.parse(`${today}T00:00:00Z`);
  const wall = Date.parse(`${new Date(guess).toLocaleString('sv-SE', { timeZone: TIME_ZONE }).replace(' ', 'T')}Z`); // the zone's clock at that instant
  return new Date(guess - (wall - guess)).toISOString().replace('T', ' ').slice(0, 19);
};
