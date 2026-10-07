import Link from 'next/link';
import type { Locale } from '@/lib/questions';
import { fmtDate, t } from '@/lib/i18n';
import type { EventRow } from '@/lib/data';
import { eventName } from '@/lib/data';

const fmtDay = (iso: string, locale: Locale) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
const daysUntil = (iso: string | null, today: string) => (iso ? Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000) : null);

/** Upcoming event: poster (when one is set in Admin → Événements) or a branded card, deadline, date, links. */
export function EventCard({ e, locale, today, interestHref }: { e: EventRow; locale: Locale; today: string; interestHref: string }) {
  const d = t(locale).home.events;
  const name = eventName(e);
  const left = daysUntil(e.cfp_close_date, today);
  const state: 'closed' | 'open' | 'soon' = !e.cfp_close_date ? 'soon' : left! < 0 ? 'closed' : 'open';
  return (
    <article className="event-card" aria-labelledby={`ev-${e.city}`}>
      {e.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="event-poster" src={e.poster_url} alt={d.posterAlt(name)} width={800} height={1000} loading="lazy" decoding="async" />
      ) : (
        <div className="event-art" data-theme="nuit" aria-hidden="true">
          <span className="label-s">{d.cfpLabel}</span>
          <strong>{e.event_date ? fmtDay(e.event_date, locale) : d.toConfirm}</strong>
        </div>
      )}
      <div className="event-body">
        <div className="event-head">
          <h3 id={`ev-${e.city}`}>{name}</h3>
          <span className={`pill ${state === 'open' ? 'ok' : state === 'closed' ? 'bad' : ''}`}>{state === 'open' ? d.open : state === 'closed' ? d.closed : d.soon}</span>
        </div>
        <dl className="event-facts">
          <div><dt>{d.cfpClose}</dt><dd>{e.cfp_close_date ? fmtDate(e.cfp_close_date, locale) : d.toConfirm}{e.cfp_close_note ? ` · ${e.cfp_close_note}` : ''}{state === 'open' && left !== null && <em> · {d.daysLeft(left)}</em>}</dd></div>
          <div><dt>{d.eventDate}</dt><dd>{e.event_date ? fmtDate(e.event_date, locale) : d.toConfirm}</dd></div>
          {e.venue && <div><dt>{d.venue}</dt><dd>{e.venue}</dd></div>}
        </dl>
        <div className="event-actions">
          {state !== 'closed' && <Link className="btn btn-sm" href={interestHref}>{d.cta}</Link>}
          {e.submission_url && state !== 'closed' && (
            <a className="btn btn-sm btn-ghost" href={e.submission_url} target="_blank" rel="noopener noreferrer">{d.callLink}<span className="sr-only"> ({name})</span></a>
          )}
        </div>
      </div>
    </article>
  );
}
