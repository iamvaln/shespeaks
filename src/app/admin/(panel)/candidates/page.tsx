import Link from 'next/link';
import { candidateRows, type Row } from '@/lib/admin-data';
import { STATUSES, statusLabel } from '@/lib/db';
import { listCoaches } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';
import { norm, initials } from '@/lib/text';
import { requireCoach } from '@/lib/auth';
import { screenProgress } from '@/lib/reminders';
import { BRANCH_SHORT, elapsed, pageList, statusTone } from '@/lib/admin-format';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';
import { Icon } from '@/components/admin-icons';

type SP = Record<'q' | 'event' | 'status' | 'coach' | 'start' | 'order' | 'page' | 'msg', string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ''; // ?q=a&q=b arrives as a list

export const metadata = { title: 'Candidates' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 25;
const DEFAULT_ORDER = 'activity-desc';
const COLS: Record<string, (a: Row, b: Row) => number> = {
  name: (a, b) => norm(a.name ?? '').localeCompare(norm(b.name ?? '')),
  event: (a, b) => a.event_label.localeCompare(b.event_label),
  status: (a, b) => STATUSES.findIndex((s) => s.id === a.status) - STATUSES.findIndex((s) => s.id === b.status),
  activity: (a, b) => a.updated_at.localeCompare(b.updated_at),
};
const ORDER_CHOICES: [string, string][] = [['activity-desc', 'Activité récente'], ['activity-asc', 'Activité ancienne'], ['name-asc', 'Nom A → Z'], ['status-asc', 'Statut'], ['event-asc', 'Événement']];

export default async function Candidates({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireCoach();
  const raw = await searchParams;
  const sp = { q: one(raw.q), event: one(raw.event), status: one(raw.status), coach: one(raw.coach), start: one(raw.start), order: one(raw.order), page: one(raw.page), msg: one(raw.msg) };
  const all = await candidateRows();
  const coaches = await listCoaches();
  const now = new Date();
  const events = [...new Set(all.map((r) => r.event_label))].sort();
  const q = norm(sp.q);

  // only known values are used: a hand-typed ?order=__proto__ or ?start=Z is ignored
  const [col, dir] = sp.order.split('-');
  const order = Object.hasOwn(COLS, col) && (dir === 'asc' || dir === 'desc') ? `${col}-${dir}` : DEFAULT_ORDER;
  const [orderCol, orderDir] = order.split('-');
  const start = Object.hasOwn(BRANCH_SHORT, sp.start) ? sp.start : '';
  const status = STATUSES.some((s) => s.id === sp.status) ? sp.status : '';

  // every filter but the status: the status tabs count what each one would show
  const base = all.filter(
    (r) =>
      (!sp.event || r.event_label === sp.event) &&
      (!sp.coach || (sp.coach === 'none' ? r.coach_id === null : String(r.coach_id ?? '') === sp.coach)) &&
      (!start || r.branch === start) &&
      (!q || norm(`${r.name} ${r.topic} ${r.whatsapp} ${r.email ?? ''} ${r.role ?? ''}`).includes(q)),
  );
  const counts = new Map<string, number>();
  for (const r of base) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const rows = base.filter((r) => !status || r.status === status).sort((a, b) => COLS[orderCol](a, b) * (orderDir === 'asc' ? 1 : -1));

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(sp.page)) || 1));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const filtered = !!(sp.q || sp.event || status || sp.coach || start);

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = { q: sp.q, event: sp.event, status, coach: sp.coach, start, order: order === DEFAULT_ORDER ? '' : order, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/admin/candidates${qs ? `?${qs}` : ''}`;
  };
  const sortHref = (c: string) => href({ order: order === `${c}-asc` ? `${c}-desc` : order === `${c}-desc` ? `${c}-asc` : c === 'activity' ? 'activity-desc' : `${c}-asc`, page: '' });
  const aria = (c: string): 'ascending' | 'descending' | undefined => (order === `${c}-asc` ? 'ascending' : order === `${c}-desc` ? 'descending' : undefined);
  const arrow = (c: string) => (order === `${c}-asc` ? ' ↑' : order === `${c}-desc` ? ' ↓' : '');

  const tabs = [{ id: '', label: 'Toutes', n: base.length }, ...STATUSES.filter((s) => (counts.get(s.id) ?? 0) > 0 || s.id === status || s.id === 'diagnostic_recu' || s.id === 'en_cours').map((s) => ({ id: s.id, label: s.label, n: counts.get(s.id) ?? 0 }))];

  return (
    <div className="a-page" style={{ gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 className="a-h1" style={{ margin: 0 }}>Candidates</h1>
        <span className="a-muted" style={{ fontSize: 15 }}>{all.length} au total</span>
      </div>
      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}

      <nav className="a-tabs" aria-label="Filtrer par statut">
        {tabs.map((t) => (
          <Link key={t.id || 'all'} href={href({ status: t.id, page: '' })} className="a-tab" aria-current={(status || '') === t.id ? 'true' : undefined}>
            {t.label}<span>{t.n}</span>
          </Link>
        ))}
      </nav>

      <AutoSubmitForm className="a-filters" method="get" action="/admin/candidates" defaults={{ order: DEFAULT_ORDER }} role="search" aria-label="Rechercher et filtrer">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="a-field a-field-search">
          <span className="sr-only">Rechercher</span>
          <Icon name="search" />
          <input type="search" name="q" defaultValue={sp.q} placeholder="Nom, sujet, téléphone, email…" autoComplete="off" />
        </label>
        <label className="a-field-select"><span className="sr-only">Événement</span>
          <select name="event" defaultValue={sp.event ?? ''}><option value="">Tous les événements</option>{events.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="a-field-select"><span className="sr-only">Coach</span>
          <select name="coach" defaultValue={sp.coach ?? ''}><option value="">Toutes les coachs</option><option value="none">Non assignées</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="a-field-select"><span className="sr-only">Point de départ</span>
          <select name="start" defaultValue={start}><option value="">Tous les départs</option>{Object.entries(BRANCH_SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="a-field-select a-only-s"><span className="sr-only">Trier par</span>
          <select name="order" defaultValue={order}>{(ORDER_CHOICES.some(([v]) => v === order) ? ORDER_CHOICES : [...ORDER_CHOICES, [order, 'Tri actuel'] as [string, string]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <noscript><button className="a-btn">Filtrer</button></noscript>
        {filtered && <Link className="a-more" href="/admin/candidates" style={{ alignSelf: 'center' }}>Réinitialiser</Link>}
      </AutoSubmitForm>

      <section className="a-card is-flush" aria-label="Liste des candidates">
        {rows.length === 0 ? (
          <p className="a-empty">Aucune candidate ne correspond. {filtered && <Link className="a-more" href="/admin/candidates">Réinitialiser les filtres</Link>}</p>
        ) : (
          <div role="table" aria-label="Candidates" style={{ ['--cols' as string]: 'minmax(0,2.3fr) minmax(0,1.5fr) minmax(0,1.7fr) minmax(0,1.2fr) 150px 56px 110px 18px' }}>
            <div role="row" className="a-th">
              <span role="columnheader" aria-sort={aria('name')}><Link href={sortHref('name')} className="a-sort">Nom{arrow('name')}</Link></span>
              <span role="columnheader" aria-sort={aria('event')}><Link href={sortHref('event')} className="a-sort">Événement{arrow('event')}</Link></span>
              <span role="columnheader">Sujet</span>
              <span role="columnheader">Départ</span>
              <span role="columnheader" aria-sort={aria('status')}><Link href={sortHref('status')} className="a-sort">Statut{arrow('status')}</Link></span>
              <span role="columnheader">Coach</span>
              <span role="columnheader" aria-sort={aria('activity')}><Link href={sortHref('activity')} className="a-sort">Activité{arrow('activity')}</Link></span>
              <span role="columnheader" aria-label="Ouvrir" />
            </div>
            {shown.map((r) => {
              const p = r.status === 'en_cours' ? screenProgress(r) : null;
              return (
                <div role="row" className="a-tr is-cand" key={r.id}>
                  <div role="cell" className="a-cell-name c-name">
                    <span className="a-avatar-c" aria-hidden="true">{initials(r.name ?? '')}</span>
                    <span style={{ minWidth: 0 }}>
                      <Link href={`/admin/candidates/${r.id}`} className="a-name a-stretch">{r.name}</Link>
                      <span className="a-sub">{r.role}</span>
                      <span className="a-sub a-only-s">{r.event_label}{r.branch ? ` · ${BRANCH_SHORT[r.branch]}` : ''}</span>
                    </span>
                  </div>
                  <span role="cell" className="a-trunc a-hide-s">{r.event_label}</span>
                  <span role="cell" className={`a-trunc c-topic${r.topic ? '' : ' a-muted'}`}>{r.topic || (r.status === 'en_cours' ? '—' : 'Pas encore de sujet')}</span>
                  <span role="cell" className={`a-trunc a-hide-s${r.branch ? '' : ' a-muted'}`}>{r.branch ? BRANCH_SHORT[r.branch] : 'Pas encore choisi'}</span>
                  <span role="cell" className="c-status">
                    <span className={`a-pill is-${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                    {p && <span className="a-sub" style={{ marginTop: 4 }}>écran {p.done} sur {p.total}</span>}
                  </span>
                  <span role="cell" className="c-coach">
                    {r.coach_name
                      ? <span className={`a-coach${r.coach_id === me.id ? ' is-me' : ''}`} title={r.coach_name}>{initials(r.coach_name)}<span className="sr-only"> {r.coach_name}</span></span>
                      : <span className="a-coach is-none">–<span className="sr-only">Non assignée</span></span>}
                  </span>
                  <span role="cell" className="a-muted c-when" title={fmtDate(r.updated_at, 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}>il y a {elapsed(r.updated_at, now)}</span>
                  <span role="cell" className="a-chev a-hide-s" aria-hidden="true"><Icon name="chevron" /></span>
                </div>
              );
            })}
          </div>
        )}
        {rows.length > 0 && (
          <div className="a-card-foot a-pager">
            <span className="a-muted">{(page - 1) * PER_PAGE + 1} à {(page - 1) * PER_PAGE + shown.length} sur {rows.length}</span>
            {pages > 1 && (
              <nav aria-label="Pagination" className="a-pages">
                {page > 1 ? <Link href={href({ page: String(page - 1) })} aria-label="Page précédente" className="a-page-link"><Icon name="chevron" style={{ transform: 'scaleX(-1)' }} /></Link> : null}
                {pageList(page, pages).map((n, i) => n === '…'
                  ? <span key={`g${i}`} className="a-page-gap" aria-hidden="true">…</span>
                  : <Link key={n} href={href({ page: String(n) })} className="a-page-link" aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`}>{n}</Link>)}
                {page < pages ? <Link href={href({ page: String(page + 1) })} aria-label="Page suivante" className="a-page-link"><Icon name="chevron" /></Link> : null}
              </nav>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
