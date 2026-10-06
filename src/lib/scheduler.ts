// In-process scheduler: runs the reminder engine every 10 minutes. Started from instrumentation.ts.
import { runReminders } from './reminders.ts';

const g = globalThis as unknown as { __shespeaksScheduler?: NodeJS.Timeout; __shespeaksBusy?: boolean };

export function startScheduler() {
  if (g.__shespeaksScheduler || process.env.ENABLE_SCHEDULER === 'false') return;
  const tick = async () => {
    if (g.__shespeaksBusy) return;
    g.__shespeaksBusy = true;
    try {
      const r = await runReminders();
      if (r.due.length) console.log(`[reminders] ${r.due.length} due → ${r.candidateEmails} candidate email(s), ${r.coachAlerts} coach alert(s)`);
    } catch (e) {
      console.error('[reminders] run failed', e);
    } finally {
      g.__shespeaksBusy = false;
    }
  };
  g.__shespeaksScheduler = setInterval(tick, 10 * 60 * 1000);
  g.__shespeaksScheduler.unref?.();
  setTimeout(tick, 30_000).unref?.();
  console.log('[reminders] scheduler started (every 10 min)');
}
