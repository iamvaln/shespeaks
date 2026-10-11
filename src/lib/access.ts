// « Retrouver mon espace »: a candidate who lost her session types her email and receives her personal link(s). The answer never says
// whether the address is known (same response, the email is sent after the response), like the coach login.
import { all } from './db.ts';
import { mailboxKey } from './contact.ts';
import { appUrl, candidateAccessLinks, deferMail, sendMail } from './mail.ts';
import { checkAccessRate } from './ratelimit.ts';
import { eventLabel, listEvents } from './data.ts';
import { fmtDate } from './i18n.ts';
import type { Locale } from './questions.ts';

type Entry = { event: string; date: string; url: string };
type Sender = (to: string, entries: Entry[], loc: Locale) => Promise<void>;
let sender: Sender = async (to, entries, loc) => {
  const m = candidateAccessLinks(entries, loc);
  await sendMail({ ...m, to, kind: 'candidate_access_link' });
};
/** Tests replace the sender to see what would be sent. */
export const setAccessSender = (s: Sender) => { sender = s; };

export async function requestAccess(email: string, ip: string): Promise<{ retryAfterSec?: number }> {
  const e = email.trim().toLowerCase().slice(0, 254);
  const rate = await checkAccessRate(ip, e ? mailboxKey(e) : '');
  if (!rate.ok) return { retryAfterSec: rate.retryAfterSec };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return {};
  const job = async () => {
    const box = mailboxKey(e);
    const rows = (await all<{ token: string; email: string; created_at: string; city: string | null; city_other: string | null; locale: Locale }>(
      `SELECT token,email,created_at,city,city_other,locale FROM candidates WHERE email IS NOT NULL AND name IS NOT NULL ORDER BY created_at DESC LIMIT 2000`))
      .filter((r) => mailboxKey(r.email) === box);
    if (!rows.length) return;
    const events = await listEvents();
    const loc = rows[0].locale;
    // the address she typed when it is a registered one (same mailbox either way), else the most recent registered one
    const to = rows.find((r) => r.email.trim().toLowerCase() === e)?.email ?? rows[0].email;
    await sender(to, rows.map((r) => ({ event: eventLabel(r, events, loc), date: fmtDate(r.created_at, loc), url: `${appUrl()}/reprendre/${r.token}` })), loc);
  };
  // tests (no request scope) run it inline; a real request answers first, then sends
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) await job(); else deferMail(job);
  return {};
}
