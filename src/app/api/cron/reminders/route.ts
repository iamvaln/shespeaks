import { NextResponse, type NextRequest } from 'next/server';
import { runReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

// Drive the reminder engine from an external cron if you disable the in-process scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/reminders
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || secret === 'change-me' || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await runReminders());
}
export const GET = handle;
export const POST = handle;
