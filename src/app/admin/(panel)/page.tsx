import Link from 'next/link';
import { candidateRows } from '@/lib/admin-data';
import { STATUSES, getSetting, statusLabel } from '@/lib/db';
import { eventName, listEvents } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';

const daysUntil = (iso: string | null) => (iso ? Math.ceil((new Date(iso + 'T23:59:59Z').getTime() - Date.now()) / 86_400_000) : null);
const idleH = (s: string) => Math.round((Date.now() - new Date(s.replace(' ', 'T') + 'Z').getTime()) / 3_600_000);
const idleLabel = (h: number) => (h < 48 ? `${h} h` : `${Math.round(h / 24)} j`);

export default async function Dashboard() {
  const rows = await candidateRows();
  const events = await listEvents();
  const deadline = await getSetting('internal_deadline');
  const left = daysUntil(deadline);
  const events_ = [...new Set(rows.map((r) => r.event_label))].sort();
  const received = rows.filter((r) => r.status === 'diagnostic_recu');
  const stalled = rows.filter((r) => r.status === 'en_cours').sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at));
  const count = (st: string, ev?: string) => rows.filter((r) => r.status === st && (!ev || r.event_label === ev)).length;
  const dueSoon = rows.filter((r) => r.next_point_date && daysUntil(r.next_point_date)! <= 2 && !['jour_j', 'non_retenue'].includes(r.status)).sort((a, b) => a.next_point_date!.localeCompare(b.next_point_date!));

  return (
    <>
      <h1>Tableau de bord</h1>
      <div className="stats" style={{ marginBottom: 32 }}>
        <div className="stat"><div className="n">{rows.length}</div><div className="l">Candidates</div></div>
        <div className={`stat${received.length ? ' hot' : ''}`}><div className="n">{received.length}</div><div className="l">Formulaires à traiter</div></div>
        <div className="stat"><div className="n">{stalled.length}</div><div className="l">En cours (à relancer)</div></div>
        <div className="stat">
          <div className="n">{left === null ? '—' : left >= 0 ? `J-${left}` : 'dépassée'}</div>
          <div className="l">Date limite interne · {deadline ? fmtDate(deadline, 'fr', { day: 'numeric', month: 'short' }) : ''}</div>
        </div>
      </div>

      <div className="admin-cols">
        <div className="stack">
          <section>
            <h2>Intérêts reçus à traiter</h2>
            {received.length === 0 ? <p className="muted">Rien à traiter pour le moment.</p> : (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Candidate</th><th>Événement</th><th>Point de départ</th><th>Reçu</th><th></th></tr></thead>
                <tbody>{received.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td><td>{r.event_label}</td><td>{r.branch}</td>
                    <td>{fmtDate(r.completed_at, 'fr', { day: 'numeric', month: 'short' })}</td>
                    <td><Link className="btn btn-sm" href={`/admin/candidates/${r.id}`}>Ouvrir</Link></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </section>

          <section>
            <h2>Parcours commencés mais inachevés</h2>
            {stalled.length === 0 ? <p className="muted">Aucune candidate en cours.</p> : (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Candidate</th><th>Événement</th><th>Inactive depuis</th><th>Relances auto</th><th>Contact</th></tr></thead>
                <tbody>{stalled.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/candidates/${r.id}`}><strong>{r.name}</strong></Link></td><td>{r.event_label}</td>
                    <td>{idleLabel(idleH(r.last_activity_at))}</td><td>{r.reminders_sent}</td>
                    <td>{r.whatsapp}{r.email ? '' : ' · pas d’email'}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </section>

          {dueSoon.length > 0 && (
            <section>
              <h2>Points à tenir bientôt</h2>
              <div className="table-wrap"><table className="t"><tbody>{dueSoon.map((r) => (
                <tr key={r.id}><td><Link href={`/admin/candidates/${r.id}`}>{r.name}</Link></td><td>{r.event_label}</td><td>{fmtDate(r.next_point_date, 'fr')}</td><td>{statusLabel(r.status)}</td></tr>
              ))}</tbody></table></div>
            </section>
          )}

          <section>
            <h2>Candidates par statut et par événement</h2>
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Statut</th>{events_.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>{STATUSES.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/admin/candidates?status=${s.id}`}>{s.label}</Link></td>
                  {events_.map((c) => <td key={c} className="num">{count(s.id, c) || '·'}</td>)}
                  <td className="num"><strong>{count(s.id) || '·'}</strong></td>
                </tr>))}</tbody>
            </table></div>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <h2>Clôtures des appels à speakers</h2>
            <ul className="hist">{events.map((e) => {
              const d = daysUntil(e.cfp_close_date);
              return (
                <li key={e.city}>
                  <strong>{eventName(e)}</strong> — {e.cfp_close_date ? fmtDate(e.cfp_close_date, 'fr') : 'à confirmer'}
                  {d !== null && <div className="countdown" style={{ fontSize: 20 }}>{d >= 0 ? `J-${d}` : 'clôturé'}</div>}
                  <div className="small">{e.event_date ? `Événement : ${fmtDate(e.event_date, 'fr')}` : 'Événement : à confirmer'}</div>
                </li>
              );
            })}</ul>
            <p style={{ marginTop: 12 }}><Link href="/admin/events">Gérer les événements</Link></p>
          </section>
        </aside>
      </div>
    </>
  );
}
