// « Retrouver mon espace »: a candidate who lost her session types her email and receives her personal link(s) and a code to type back
// (resume-code.ts). The answer never says whether the address is known (same response, the email is sent after the response).
import { mailboxKey } from './contact.ts';
import { issueCode, journeysOf, resumeTarget } from './resume-code.ts';
import { appUrl, candidateAccessLinks, deferMail, sendMail } from './mail.ts';
import { checkAccessRate } from './ratelimit.ts';
import { eventLabel, listEvents } from './data.ts';
import { fmtDate } from './i18n.ts';
import type { Locale } from './questions.ts';

type Entry = { event: string; date: string; url: string };
type Sender = (to: string, entries: Entry[], loc: Locale, code: string) => Promise<void>;
let sender: Sender = async (to, entries, loc, code) => {
  const m = candidateAccessLinks(entries, loc, code);
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
    const rows = await journeysOf(e);
    if (!rows.length) return;
    const target = resumeTarget(rows)!;
    const code = await issueCode(target.id);
    const events = await listEvents();
    const loc = target.locale;
    // the address she typed when it is a registered one (same mailbox either way), else the most recent registered one
    const to = rows.find((r) => r.email.trim().toLowerCase() === e)?.email ?? rows[0].email;
    // the journey the code opens comes first (its link is the button of the email)
    const ordered = [target, ...rows.filter((r) => r.id !== target.id)];
    await sender(to, ordered.map((r) => ({ event: eventLabel(r, events, loc), date: fmtDate(r.created_at, loc), url: `${appUrl()}/reprendre/${r.token}` })), loc, code);
  };
  // tests (no request scope) run it inline; a real request answers first, then sends
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) await job(); else deferMail(job);
  return {};
}
