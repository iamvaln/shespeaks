import { listEvents } from '@/lib/data';
import { saveEventAction } from '../../actions';

export const dynamic = 'force-dynamic';

function EventFields({ e }: { e?: Awaited<ReturnType<typeof listEvents>>[number] }) {
  return (
    <div className="grid grid-3">
      <label className="small">Ville<input className="input" name="name" defaultValue={e?.name} required /></label>
      <label className="small">Clôture de l’appel (date)<input className="input" type="date" name="cfp_close_date" defaultValue={e?.cfp_close_date ?? ''} /></label>
      <label className="small">Précision (heure, fuseau…)<input className="input" name="cfp_close_note" defaultValue={e?.cfp_close_note ?? ''} placeholder="à 23 h 59 (heure locale)" /></label>
      <label className="small">Date de l’événement<input className="input" type="date" name="event_date" defaultValue={e?.event_date ?? ''} /></label>
      <label className="small">Lieu<input className="input" name="venue" defaultValue={e?.venue ?? ''} /></label>
      <label className="small">Lien de soumission (URL)<input className="input" type="url" name="submission_url" defaultValue={e?.submission_url ?? ''} /></label>
      <label className="small" style={{ gridColumn: '1 / -1' }}>Libellé du lien affiché à la candidate<input className="input" name="submission_label" defaultValue={e?.submission_label ?? ''} /></label>
    </div>
  );
}

export default async function Events({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const events = await listEvents();
  return (
    <>
      <h1>Calendrier des DevFest</h1>
      {sp.msg && <div className="flash">{sp.msg}</div>}
      {sp.err && <div className="flash err">{sp.err}</div>}
      <p className="muted" style={{ marginBottom: 24 }}>Ces dates alimentent le plan de route de chaque candidate selon sa ville. Une ville sans dates affiche « Dates à confirmer avec ta coach ».</p>
      <div className="stack">
        {events.map((e) => (
          <form key={e.id} action={saveEventAction} className="card stack">
            <input type="hidden" name="id" value={e.id} />
            <EventFields e={e} />
            <div><button className="btn btn-sm">Enregistrer {e.name}</button></div>
          </form>
        ))}
        <form action={saveEventAction} className="card stack">
          <h2>Ajouter une ville</h2>
          <input type="hidden" name="id" value="0" />
          <EventFields />
          <div><button className="btn btn-sm">Ajouter la ville</button></div>
        </form>
      </div>
    </>
  );
}
