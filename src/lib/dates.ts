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
