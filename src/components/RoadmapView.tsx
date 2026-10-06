import type { Roadmap } from '@/lib/roadmap';
import type { Locale } from '@/lib/questions';
import { fmtDate, t } from '@/lib/i18n';

/** Roadmap as the candidate sees it (also reused read-only in the admin fiche). */
export function RoadmapView({
  rm, locale, photoUrl, internalDeadline,
}: { rm: Roadmap; locale: Locale; photoUrl?: string | null; internalDeadline?: string | null }) {
  const d = t(locale).plan;
  const ev = rm.calendar.event;
  return (
    <div className="stack">
      <section className="badge-card" aria-label="Badge speaker">
        <div className="ring" style={{ ['--size' as string]: '168px' }}>
          <div>{/* eslint-disable-next-line @next/next/no-img-element */}{photoUrl ? <img src={photoUrl} alt="" /> : <span>SHE</span>}</div>
        </div>
        <div>
          <p className="label-s">{d.badge} · DEVFEST {rm.badge.devfest.toUpperCase()}</p>
          <p className="name">{rm.badge.name}</p>
          <p className="talk">{rm.badge.title === 'à définir' || rm.badge.title === 'to be defined' ? d.toDefine : rm.badge.title}</p>
          <p className="meta">{[rm.badge.role, rm.badge.format].filter(Boolean).join(' · ')}</p>
        </div>
      </section>

      <section className="next-action">
        <p className="label-s">{d.nextAction}</p>
        <p>{rm.nextAction}</p>
      </section>

      <section>
        <h2 className="title" style={{ marginBottom: 8 }}>{d.steps}</h2>
        <p className="small" style={{ marginBottom: 24 }}><span className="legend-star">★</span> {d.star}</p>
        <ol className="rm-steps">
          {rm.steps.map((s) => (
            <li key={s.n} className={`rm-step${s.done ? ' done' : ''}`}>
              <div className="num" aria-hidden="true">{s.done ? '✓' : s.n}</div>
              <div>
                <h3>
                  <span>{s.title}</span>
                  <span className="label-s muted">{d.stepLabel(s.n)}</span>
                  {s.done && <span className="pill ok">{d.stepDone}</span>}
                </h3>
                <ul>
                  {s.actions.map((a) => (
                    <li key={a.text} className={a.personalized ? 'star' : undefined}>
                      {a.personalized && <span className="sr-only">★ </span>}
                      {a.text}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card card-lg">
        <h2 className="title" style={{ fontSize: 22, marginBottom: 12 }}>{d.calendar}</h2>
        {rm.calendar.pending ? (
          <p>{d.toConfirmCoach}</p>
        ) : (
          ev && (
            <dl className="kv" style={{ gridTemplateColumns: '200px 1fr' }}>
              <dt>{d.cfp}</dt>
              <dd>{fmtDate(ev.cfp_close_date, locale)}{ev.cfp_close_note ? ` · ${ev.cfp_close_note}` : ''}</dd>
              <dt>{d.eventDate}</dt>
              <dd>{ev.event_date ? fmtDate(ev.event_date, locale) : '—'}</dd>
              {ev.venue && (<><dt>{d.venue}</dt><dd>{ev.venue}</dd></>)}
              {ev.submission_url && (
                <>
                  <dt>{d.submit}</dt>
                  <dd><a href={ev.submission_url} target="_blank" rel="noopener noreferrer">{ev.submission_label || ev.submission_url}</a></dd>
                </>
              )}
            </dl>
          )
        )}
        {internalDeadline && <p className="small" style={{ marginTop: 16 }}>{d.internalDeadline(fmtDate(internalDeadline, locale))}</p>}
      </section>
    </div>
  );
}
