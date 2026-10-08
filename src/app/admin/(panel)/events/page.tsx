import { listEvents, eventName } from '@/lib/data';
import { requireCoach } from '@/lib/auth';
import { fmtDate } from '@/lib/i18n';
import { countdown, daysUntil, todayIso } from '@/lib/dates';
import { saveEventAction } from '../../actions';

export const dynamic = 'force-dynamic';

function EventFields({ e }: { e?: Awaited<ReturnType<typeof listEvents>>[number] }) {
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
    </div>
  );
}

export const metadata = { title: 'Événements' };
export default async function Events({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireCoach();
  const sp = await searchParams;
  const events = await listEvents();
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
              <EventFields e={e} />
              <div><button className="a-btn">Enregistrer {eventName(e)}</button></div>
            </form>
          );
        })}
        <form action={saveEventAction} className="a-card a-stack">
          <h2 className="a-h2">Ajouter un événement</h2>
          <input type="hidden" name="id" value="0" />
          <EventFields />
          <div><button className="a-btn is-ghost">Ajouter l’événement</button></div>
        </form>
      </div>
    </div>
  );
}
