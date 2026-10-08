import Link from 'next/link';
import { candidateRows } from '@/lib/admin-data';
import { STATUSES, statusLabel } from '@/lib/db';
import { listCoaches } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';
import { norm } from '@/lib/text';

type SP = { q?: string; event?: string; status?: string; coach?: string; sort?: string; dir?: string; msg?: string };

const SORTS: Record<string, (r: Awaited<ReturnType<typeof candidateRows>>[number]) => string> = {
  name: (r) => norm(r.name ?? ''),
  event: (r) => r.event_label,
  status: (r) => String(STATUSES.findIndex((s) => s.id === r.status)).padStart(2, '0'),
  updated: (r) => r.updated_at,
  next: (r) => r.next_point_date ?? '9999',
  branch: (r) => r.branch ?? 'Z',
};

export const dynamic = 'force-dynamic';

export default async function Candidates({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await candidateRows();
  const events_ = [...new Set(all.map((r) => r.event_label))].sort();
  const coaches = await listCoaches();
  const q = norm(sp.q ?? '');
  let rows = all.filter(
    (r) =>
      (!sp.event || r.event_label === sp.event) && (!sp.status || r.status === sp.status) && (!sp.coach || String(r.coach_id ?? '') === sp.coach) &&
      (!q || norm(`${r.name} ${r.topic} ${r.whatsapp} ${r.email ?? ''} ${r.role ?? ''}`).includes(q)),
  );
  const sort = SORTS[sp.sort ?? ''] ? sp.sort! : 'updated';
  const dir = sp.dir === 'asc' || (!sp.dir && sort !== 'updated') ? 1 : -1;
  rows = rows.sort((a, b) => (SORTS[sort](a) < SORTS[sort](b) ? -1 : SORTS[sort](a) > SORTS[sort](b) ? 1 : 0) * dir);

  const link = (col: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'sort' && k !== 'dir' && k !== 'msg') as [string, string][]);
    p.set('sort', col);
    p.set('dir', sort === col && dir === 1 ? 'desc' : 'asc');
    return `/admin/candidates?${p}`;
  };
  const arrow = (col: string) => (sort === col ? (dir === 1 ? ' ↑' : ' ↓') : '');
  const perEvent = (st?: string) => events_.map((c) => `${c} ${rows.filter((r) => r.event_label === c && (!st || r.status === st)).length}`).join(' · ');

  return (
    <>
      <h1>Candidates</h1>
      {sp.msg && <div className="flash">{sp.msg}</div>}
      <form className="filters" method="get">
        <label>Recherche<input className="input" name="q" defaultValue={sp.q} placeholder="Nom, sujet, téléphone…" /></label>
        <label>Événement<select className="select" name="event" defaultValue={sp.event ?? ''}><option value="">Toutes</option>{events_.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Statut<select className="select" name="status" defaultValue={sp.status ?? ''}><option value="">Tous</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Coach<select className="select" name="coach" defaultValue={sp.coach ?? ''}><option value="">Toutes</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="btn btn-sm">Filtrer</button>
        <Link className="btn btn-sm btn-ghost" href="/admin/candidates">Réinitialiser</Link>
      </form>
      <p className="small" style={{ marginBottom: 12 }}>{rows.length} candidate{rows.length > 1 ? 's' : ''} · {perEvent()}</p>
      <div className="table-wrap">
        <table className="t">
          <thead><tr>
            <th><Link href={link('name')}>Nom{arrow('name')}</Link></th>
            <th><Link href={link('event')}>Événement{arrow('event')}</Link></th>
            <th>Sujet</th>
            <th><Link href={link('branch')}>Départ{arrow('branch')}</Link></th>
            <th><Link href={link('status')}>Statut{arrow('status')}</Link></th>
            <th>Coach</th>
            <th><Link href={link('next')}>Prochain point{arrow('next')}</Link></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="muted">Aucune candidate ne correspond.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/candidates/${r.id}`}><strong>{r.name}</strong></Link><div className="small">{r.role}</div></td>
                <td>{r.event_label}</td>
                <td>{r.topic || <span className="muted">—</span>}</td>
                <td>{r.branch ?? '—'}</td>
                <td><span className={`status s-${r.status}`}>{statusLabel(r.status)}</span></td>
                <td>{r.coach_name ?? <span className="muted">—</span>}</td>
                <td>{r.next_point_date ? fmtDate(r.next_point_date, 'fr', { day: 'numeric', month: 'short' }) : <span className="muted">—</span>}{r.note_count ? <div className="small">{r.note_count} note{r.note_count > 1 ? 's' : ''}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
