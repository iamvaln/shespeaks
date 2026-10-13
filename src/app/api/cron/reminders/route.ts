import { NextResponse, type NextRequest } from 'next/server';
import { runReminders } from '@/lib/reminders';
import { runCalendarReminders } from '@/lib/calendar-reminders';

export const dynamic = 'force-dynamic';

// Drive the reminder engine from an external cron if you disable the in-process scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/reminders
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || secret === 'change-me' || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // The calendar pass runs first: whoever it writes to is not written to again today by the other pass. `?dry=1` previews the calendar pass
  // and skips the other one, which has no preview mode (it would send for real).
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  let calendar: unknown;
  try {
    calendar = await runCalendarReminders(new Date(), { dry });
  } catch (e) {
    console.error('[cron] calendar reminders failed', e);
    calendar = { error: e instanceof Error ? e.message : String(e) }; // the other pass still runs
  }
  if (dry) return NextResponse.json({ dry: true, skipped: 'runReminders', calendar });
  return NextResponse.json({ ...(await runReminders()), calendar });
}
export const GET = handle;
export const POST = handle;
