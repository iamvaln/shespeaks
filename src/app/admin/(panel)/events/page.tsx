import { listEvents, eventName, getRefs, csvList } from '@/lib/data';
import type { Option } from '@/lib/questions';
import { requireCoach } from '@/lib/auth';
import { fmtDate } from '@/lib/i18n';
import { countdown, daysUntil, todayIso } from '@/lib/dates';
import { saveEventAction } from '../../actions';

export const dynamic = 'force-dynamic';

const FORMATS = [['talk', 'Talk'], ['lightning', 'Lightning talk'], ['atelier', 'Atelier (pratique, codelab)']] as const;

function EventFields({ e, domains }: { e?: Awaited<ReturnType<typeof listEvents>>[number]; domains: Option[] }) {
  const formats = csvList(e?.accepted_formats);
  const themes = csvList(e?.themes);
  return (
    <div className="a-grid-3">
      <label className="a-label a-span">Nom de l’événement<input className="a-input" name="title" defaultValue={e?.title ?? ''} placeholder="DevFest Douala 2026" required /></label>
      <label className="a-label">Ville ou lieu général<input className="a-input" name="name" defaultValue={e?.name} placeholder="Douala" /></label>
      <label className="a-label">Date de l’événement<input className="a-input" type="date" name="event_date" defaultValue={e?.event_date ?? ''} /></label>
      <label className="a-label">Lieu précis<input className="a-input" name="venue" defaultValue={e?.venue ?? ''} /></label>
      <label className="a-label">Date limite de l’appel à speakers<input className="a-input" type="date" name="cfp_close_date" defaultValue={e?.cfp_close_date ?? ''} /></label>
      <label className="a-label">Précision (heure, fuseau…)<input className="a-input" name="cfp_close_note" defaultValue={e?.cfp_close_note ?? ''} placeholder="à 23 h 59 (heure locale)" /></label>
      <label className="a-label">Lien de candidature (URL)<input className="a-input" type="url" name="submission_url" defaultValue={e?.submission_url ?? ''} /></label>
      <label className="a-label a-span">Libellé du lien affiché à la candidate<input className="a-input" name="submission_label" defaultValue={e?.submission_label ?? ''} /></label>
      <label className="a-label a-span">
        Affiche de l’événement (facultatif)
        <input className="a-input" name="poster_url" defaultValue={e?.poster_url ?? ''} placeholder="/events/devfest-douala-2026.jpg" />
        <span className="a-sub" style={{ fontWeight: 400, whiteSpace: 'normal' }}>Chemin d’un fichier ajouté dans <code>public/events/</code>, ou adresse https://. Affichée sur la page d’accueil.</span>
      </label>
      <label className="a-label a-span">
        Thème de l’édition (facultatif)
        <input className="a-input" name="theme" defaultValue={e?.theme ?? ''} placeholder="Build with AI" maxLength={200} />
        <span className="a-sub" style={{ fontWeight: 400, whiteSpace: 'normal' }}>S’il est renseigné, les suggestions de l’IA s’y rattachent (au moins 3 sur 5 s’y inscrivent clairement).</span>
      </label>
      <label className="a-label a-span">
        Description de l’événement (facultatif)
        <textarea className="a-textarea" name="description" defaultValue={e?.description ?? ''} maxLength={3000} placeholder="Ce que dit l’appel à speakers : public, ce qui est attendu des sessions, durées…" />
        <span className="a-sub" style={{ fontWeight: 400, whiteSpace: 'normal' }}>Transmise à l’IA avec le thème, les formats et les thèmes ci-dessous quand une coach demande des suggestions de titres.</span>
      </label>
      <fieldset className="a-label a-span" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ padding: 0, marginBottom: 6 }}>Formats acceptés <span className="a-muted" style={{ fontWeight: 400 }}>(aucune case : non précisé, tous les formats)</span></legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          {FORMATS.map(([v, label]) => <label key={v} className="a-check" style={{ fontWeight: 400 }}><input type="checkbox" name="accepted_formats" value={v} defaultChecked={formats.includes(v)} /><span>{label}</span></label>)}
        </div>
      </fieldset>
      <fieldset className="a-label a-span" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ padding: 0, marginBottom: 6 }}>Thèmes attendus <span className="a-muted" style={{ fontWeight: 400 }}>(liste des domaines des Paramètres ; aucune case : non précisé)</span></legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          {domains.map((d) => <label key={d.value} className="a-check" style={{ fontWeight: 400 }}><input type="checkbox" name="themes" value={d.value} defaultChecked={themes.includes(d.value)} /><span>{d.label.fr}</span></label>)}
        </div>
      </fieldset>
    </div>
  );
}

export const metadata = { title: 'Événements' };
export default async function Events({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireCoach();
  const sp = await searchParams;
  const [events, refs] = await Promise.all([listEvents(), getRefs()]);
  const today = todayIso();
  return (
    <div className="a-page" style={{ gap: 20 }}>
      <div>
        <h1 className="a-h1" style={{ margin: 0 }}>Événements</h1>
        <p className="a-muted" style={{ margin: '8px 0 0', maxWidth: '80ch' }}>Les candidates choisissent l’un de ces événements dans le formulaire ; ses dates alimentent leur plan de route et la page d’accueil (événements à venir). Un événement sans dates affiche « Dates à confirmer avec l’équipe SheSpeaks ».</p>
      </div>
      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert" style={{ margin: 0 }}>{sp.err}</div>}
      <div className="a-stack" style={{ gap: 20 }}>
        {events.map((e) => {
          const d = daysUntil(e.cfp_close_date, today);
          return (
            <form key={e.id} action={saveEventAction} className="a-card a-stack" aria-label={eventName(e)}>
              <input type="hidden" name="id" value={e.id} />
              <div className="a-row-between" style={{ flexWrap: 'wrap' }}>
                <h2 className="a-h2">{eventName(e)}</h2>
                <span className={`a-pill ${d === null ? '' : d < 0 ? '' : 'is-amber'}`}>{d === null ? 'Clôture à confirmer' : d < 0 ? 'Appel clôturé' : `Clôture ${countdown(d, '')} · ${fmtDate(e.cfp_close_date, 'fr', { day: 'numeric', month: 'long' })}`}</span>
              </div>
              <EventFields e={e} domains={refs.domains} />
              <div><button className="a-btn">Enregistrer {eventName(e)}</button></div>
            </form>
          );
        })}
        <form action={saveEventAction} className="a-card a-stack">
          <h2 className="a-h2">Ajouter un événement</h2>
          <input type="hidden" name="id" value="0" />
          <EventFields domains={refs.domains} />
          <div><button className="a-btn is-ghost">Ajouter l’événement</button></div>
        </form>
      </div>
    </div>
  );
}
