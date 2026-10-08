import Link from 'next/link';
import { candidateRows } from '@/lib/admin-data';
import { getSetting, statusLabel } from '@/lib/db';
import { eventName, listEvents } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';
import { TIME_ZONE, countdown, daysUntil, todayIso } from '@/lib/dates';
import { requireCoach } from '@/lib/auth';
import { screenProgress } from '@/lib/reminders';
import { BRANCH_SHORT, dayLabel, elapsed, elapsedHours, statusTone } from '@/lib/admin-format';
import { initials } from '@/lib/text';
import { Icon } from '@/components/admin-icons';

export const metadata = { title: 'Tableau de bord' };

/** Long lists show their first lines only; the rest is one click away in the filtered candidates list. */
const PREVIEW = 8;
const LATE_HOURS = 48;
/** The bar of an appel à speakers fills as the closing date comes within this many days. */
const HORIZON_DAYS = 60;

const waMe = (n: string | null) => (n ?? '').replace(/[^\d]/g, '');

export default async function Dashboard() {
  const coach = await requireCoach();
  const now = new Date();
  const today = todayIso(now);
  const rows = await candidateRows();
  const events = await listEvents();
  const deadline = await getSetting('internal_deadline');

  // oldest first: interests are handled in the order they arrived
  const received = rows.filter((r) => r.status === 'diagnostic_recu').sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));
  const stalled = rows.filter((r) => r.status === 'en_cours').sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at));
  const idle = stalled.filter((r) => elapsedHours(r.last_activity_at, now) >= LATE_HOURS).length;
  const next = events
    .filter((e) => e.cfp_close_date && daysUntil(e.cfp_close_date, today)! >= 0)
    .sort((a, b) => a.cfp_close_date!.localeCompare(b.cfp_close_date!))[0];
  const nextDays = next ? daysUntil(next.cfp_close_date, today)! : null;
  const dueSoon = rows
    .filter((r) => r.next_point_date && daysUntil(r.next_point_date, today)! <= 2 && !['jour_j', 'non_retenue'].includes(r.status))
    .sort((a, b) => a.next_point_date!.localeCompare(b.next_point_date!));
  const left = daysUntil(deadline, today);
  const dateLine = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE }).format(now);

  return (
    <div className="a-page">
      <div>
        <p className="a-eyebrow">{dateLine}</p>
        <h1 className="a-h1">Bonjour {coach.name.trim().split(/\s+/)[0]}</h1>
      </div>

      <div className="a-kpis">
        <section className="a-kpi is-night" aria-label="Intérêts à traiter">
          <p className="a-eyebrow">Intérêts à traiter</p>
          <p className="n">{received.length}</p>
          <p className="a-muted">{received.length ? `La plus ancienne attend depuis ${elapsed(received[0].completed_at ?? received[0].created_at, now)}.` : 'Rien à traiter pour le moment.'}</p>
          <Link className="more" href="/admin/candidates?status=diagnostic_recu">Traiter la liste →</Link>
        </section>
        <section className="a-kpi" aria-label="Parcours en cours">
          <p className="a-eyebrow">Parcours en cours</p>
          <p className="n">{stalled.length}</p>
          <p className="a-muted">{idle ? `Dont ${idle} inactive${idle > 1 ? 's' : ''} depuis plus de 2 jours.` : 'Aucune n’est restée longtemps sans nouvelles.'}</p>
          <Link className="more" href="/admin/candidates?status=en_cours">Voir les parcours →</Link>
        </section>
        <section className="a-kpi" aria-label="Prochaine clôture">
          <p className="a-eyebrow">Prochaine clôture</p>
          <p className="n">{nextDays === null ? '—' : countdown(nextDays, '')}</p>
          <p className="a-muted">{next ? `${eventName(next)} · ${fmtDate(next.cfp_close_date, 'fr', { day: 'numeric', month: 'long' })}.` : 'Aucune clôture à venir.'}</p>
          <Link className="more" href="/admin/events">Gérer les événements →</Link>
        </section>
      </div>

      <div className="a-split">
        <section className="a-card is-flush a-main" aria-labelledby="h-recu">
          <div className="a-card-head">
            <h2 id="h-recu" className="a-h2">Intérêts à traiter</h2>
            <span className="a-muted">Les plus anciens d’abord</span>
          </div>
          {received.length === 0 ? <p className="a-empty">Rien à traiter pour le moment.</p> : (
            <div role="table" aria-label="Intérêts à traiter" style={{ ['--cols' as string]: 'minmax(0,2.4fr) minmax(0,1.6fr) minmax(0,1.4fr) 112px 20px' }}>
              <div role="row" className="a-th">
                <span role="columnheader">Candidate</span><span role="columnheader" className="a-hide-s">Événement</span><span role="columnheader" className="a-hide-s">Point de départ</span><span role="columnheader">Attend depuis</span><span role="columnheader" aria-label="Ouvrir" />
              </div>
              {received.slice(0, PREVIEW).map((r) => {
                const wait = r.completed_at ?? r.created_at;
                return (
                  <div role="row" className="a-tr" key={r.id}>
                    <div role="cell" className="a-cell-name">
                      <span className="a-avatar-c" aria-hidden="true">{initials(r.name ?? '')}</span>
                      <span style={{ minWidth: 0 }}>
                        <Link href={`/admin/candidates/${r.id}`} className="a-name a-stretch">{r.name}</Link>
                        <span className="a-sub">{r.role}</span>
                        <span className="a-sub a-only-s">{r.event_label} · {r.branch ? BRANCH_SHORT[r.branch] : '—'}</span>
                      </span>
                    </div>
                    <span role="cell" className="a-trunc a-hide-s">{r.event_label}</span>
                    <span role="cell" className="a-trunc a-hide-s">{r.branch ? BRANCH_SHORT[r.branch] : '—'}</span>
                    <span role="cell" className={elapsedHours(wait, now) >= LATE_HOURS ? 'a-late' : undefined}>{elapsed(wait, now)}</span>
                    <span role="cell" className="a-chev a-hide-s" aria-hidden="true"><Icon name="chevron" /></span>
                  </div>
                );
              })}
            </div>
          )}
          {received.length > PREVIEW && (
            <div className="a-card-foot"><Link className="a-more" href="/admin/candidates?status=diagnostic_recu">Voir les {received.length} intérêts →</Link></div>
          )}
        </section>

        <div className="a-side">
          <section className="a-card a-stack" aria-labelledby="h-relance">
            <h2 id="h-relance" className="a-h2">Parcours à relancer</h2>
            {stalled.length === 0 ? <p className="a-muted" style={{ margin: 0 }}>Aucune candidate en cours.</p> : (
              <ul className="a-list">
                {stalled.slice(0, 4).map((r) => {
                  const p = screenProgress(r);
                  const wa = waMe(r.whatsapp);
                  return (
                    <li key={r.id}>
                      <div className="a-row-between">
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/admin/candidates/${r.id}`} className="a-name">{r.name}</Link>
                          <span className="a-sub" style={{ whiteSpace: 'normal' }}>Arrêtée à « {p.label} » · écran {p.done} sur {p.total}</span>
                        </div>
                        {wa && <a className="a-icon-link" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`Écrire à ${r.name} sur WhatsApp`}><Icon name="message" /></a>}
                      </div>
                      <div className="a-bar" role="img" aria-label={`Écran ${p.done} sur ${p.total}`}><i style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} /></div>
                      <span className="a-sub" style={{ whiteSpace: 'normal' }}>Inactive depuis {elapsed(r.last_activity_at, now)} · {r.reminders_sent ? `${r.reminders_sent} relance${r.reminders_sent > 1 ? 's' : ''} envoyée${r.reminders_sent > 1 ? 's' : ''}` : r.email ? 'pas encore relancée' : 'pas d’email'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {stalled.length > 0 && <Link className="a-more" href="/admin/candidates?status=en_cours">Voir les {stalled.length} parcours →</Link>}
          </section>

          {dueSoon.length > 0 && (
            <section className="a-card a-stack" aria-labelledby="h-points">
              <h2 id="h-points" className="a-h2">Points à tenir</h2>
              <ul className="a-list">
                {dueSoon.map((r) => (
                  <li key={r.id}>
                    <div className="a-row-between">
                      <Link href={`/admin/candidates/${r.id}`} className="a-name">{r.name}</Link>
                      <span className={`a-pill is-${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                    </div>
                    <span className={`a-sub${daysUntil(r.next_point_date, today)! < 0 ? ' a-late' : ''}`}>{fmtDate(r.next_point_date, 'fr', { weekday: 'long', day: 'numeric', month: 'long' })} · {dayLabel(daysUntil(r.next_point_date, today)!)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="a-card a-stack" aria-labelledby="h-calls">
            <h2 id="h-calls" className="a-h2">Appels à speakers</h2>
            <ul className="a-list">
              {events.map((e) => {
                const d = daysUntil(e.cfp_close_date, today);
                const pct = d === null ? 0 : d < 0 ? 100 : Math.round(100 - (Math.min(d, HORIZON_DAYS) / HORIZON_DAYS) * 100);
                return (
                  <li key={e.city}>
                    <div className="a-row-between" style={{ alignItems: 'baseline' }}>
                      <strong>{eventName(e)}</strong>
                      <span style={{ fontWeight: 800, fontStretch: '112%', fontSize: 18 }}>{d === null ? 'à confirmer' : countdown(d, 'clôturé')}</span>
                    </div>
                    <div className="a-bar is-amber" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
                    <span className="a-sub" style={{ whiteSpace: 'normal' }}>Clôture : {e.cfp_close_date ? fmtDate(e.cfp_close_date, 'fr', { day: 'numeric', month: 'long' }) : 'à confirmer'} · Événement : {e.event_date ? fmtDate(e.event_date, 'fr', { day: 'numeric', month: 'long' }) : 'à confirmer'}</span>
                  </li>
                );
              })}
            </ul>
            {left !== null && (
              <p className="a-sub" style={{ margin: 0, paddingTop: 12, borderTop: '1px solid var(--surface-sunken)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'normal' }}>
                <Icon name="clock" size={16} />Date limite interne : {fmtDate(deadline, 'fr', { day: 'numeric', month: 'long' })} · <strong style={{ color: 'var(--ink)' }}>{countdown(left, 'dépassée')}</strong>
              </p>
            )}
            <Link className="a-more" href="/admin/events">Gérer les événements →</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
