import Link from 'next/link';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { fmtDate, t } from '@/lib/i18n';
import { listEvents } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const locale = await getLocale();
  const d = t(locale).home;
  const c = await getCandidateFromCookie();
  const events = listEvents();
  const cta = c ? (c.completed_at ? { href: '/plan', label: d.seePlan } : { href: '/diagnostic', label: d.resume }) : { href: '/diagnostic', label: d.cta };

  return (
    <div className="container">
      <section className="hero">
        <p className="label">{d.eyebrow}</p>
        <h1 className="display-xl">{d.h1}</h1>
        <p className="lead">{d.lead}</p>
        <div className="cta-row">
          <Link className="btn" href={cta.href}>{cta.label}</Link>
        </div>
        <ul className="meta-list">{d.meta.map((m) => <li key={m}>{m}</li>)}</ul>
      </section>

      <section className="section">
        <p className="label-s">{d.forWho}</p>
        <p className="lead" style={{ marginTop: 12, maxWidth: '60ch' }}>{d.forWhoText}</p>
      </section>

      <section className="section">
        <h2 className="title">{d.stepsTitle}</h2>
        <ol className="steps-list">
          {d.steps.map(([title, text]) => (
            <li key={title}><div><strong>{title}</strong><span>{text}</span></div></li>
          ))}
        </ol>
      </section>

      <section className="section">
        <h2 className="title">{d.gainTitle}</h2>
        <ul className="ticks">{d.gains.map((g) => <li key={g}>{g}</li>)}</ul>
        <div className="cta-row" style={{ marginTop: 40 }}>
          <Link className="btn" href={cta.href}>{cta.label}</Link>
        </div>
      </section>

      <section className="section">
        <h2 className="title">{d.citiesTitle}</h2>
        <p className="muted" style={{ margin: '8px 0 24px' }}>{d.citiesIntro}</p>
        <div className="grid grid-3">
          {events.map((e) => (
            <article key={e.city} className="card card-lg city-card">
              <p className="label-s">DEVFEST</p>
              <h3>{e.name}</h3>
              <dl>
                <dt>{d.cfpClose}</dt>
                <dd>{e.cfp_close_date ? fmtDate(e.cfp_close_date, locale) : d.toConfirm}</dd>
                <dt>{d.event}</dt>
                <dd>{e.event_date ? `${fmtDate(e.event_date, locale)}${e.venue ? ` · ${e.venue}` : ''}` : d.toConfirm}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
