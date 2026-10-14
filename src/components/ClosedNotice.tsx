import Link from 'next/link';
import type { Locale } from '@/lib/questions';
import { fmtDate, t } from '@/lib/i18n';

/** Shown instead of the form once applications are closed (after the last day to send an interest, or with no event on offer). */
export function ClosedNotice({ locale, closedOn }: { locale: Locale; closedOn: string | null }) {
  const d = t(locale).closed;
  return (
    <div className="form-shell">
      <div className="container form-container">
        <section className="form-card stack" aria-labelledby="closed-title">
          <h1 id="closed-title" className="form-title">{d.title}</h1>
          <p>{closedOn ? d.since(fmtDate(closedOn, locale)) : d.noEvent}</p>
          <p>{d.next}</p>
          <div><Link className="btn btn-ghost" href="/">{d.home}</Link></div>
        </section>
      </div>
    </div>
  );
}
