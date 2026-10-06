import { getSetting } from '@/lib/db';
import { getRefs, refsToText } from '@/lib/data';
import { mailConfigured } from '@/lib/mail';
import { saveSettingsAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const sp = await searchParams;
  const refs = getRefs();
  return (
    <>
      <h1>Paramètres</h1>
      {sp.msg && <div className="flash">{sp.msg}</div>}
      <form action={saveSettingsAction} className="stack" style={{ maxWidth: 820 }}>
        <section className="card stack">
          <h2>Notifications</h2>
          <p className="small">Chaque diagnostic terminé, et chaque relance de candidate inachevée, est envoyé à la coach assignée <strong>et</strong> aux adresses ci-dessous. {mailConfigured() ? 'SMTP configuré : les emails partent réellement.' : 'SMTP non configuré : les emails sont seulement enregistrés (voir l’onglet Emails).'}</p>
          <label className="small">Email(s) de notification supplémentaires (séparés par des virgules)<input className="input" name="notification_email" defaultValue={getSetting('notification_email')} placeholder="admin@exemple.com" /></label>
        </section>

        <section className="card stack">
          <h2>Relances automatiques</h2>
          <label className="check"><input type="checkbox" name="reminders_enabled" defaultChecked={getSetting('reminders_enabled') === 'true'} /><span>Relancer les candidates dont le parcours est inachevé (email à la candidate si elle a laissé une adresse, alerte à la coach dans tous les cas)</span></label>
          <div className="grid grid-3">
            <label className="small">1re relance après (heures)<input className="input" type="number" min={1} name="reminder_first_hours" defaultValue={getSetting('reminder_first_hours')} /></label>
            <label className="small">Intervalle entre relances (heures)<input className="input" type="number" min={1} name="reminder_interval_hours" defaultValue={getSetting('reminder_interval_hours')} /></label>
            <label className="small">Nombre maximum de relances<input className="input" type="number" min={1} max={10} name="reminder_max" defaultValue={getSetting('reminder_max')} /></label>
          </div>
        </section>

        <section className="card stack">
          <h2>Calendrier interne</h2>
          <label className="small">Date limite interne (relecture avant les clôtures officielles)<input className="input" type="date" name="internal_deadline" defaultValue={getSetting('internal_deadline')} /></label>
        </section>

        <section className="card stack">
          <h2>Pistes de sujets</h2>
          <label className="check"><input type="checkbox" name="show_tracks_to_candidates" defaultChecked={getSetting('show_tracks_to_candidates') === 'true'} /><span>Afficher les pistes (non écartées) directement à la candidate sur son plan de route. Désactivé pendant la phase de test : la coach relit d’abord les pistes.</span></label>
        </section>

        <section className="card stack">
          <h2>Référentiels</h2>
          <p className="small">Une ligne par entrée : <code>identifiant | libellé français | libellé anglais</code>. Pour les angles, les identifiants sont fixes (ils déterminent les modèles de titre) : seuls les libellés sont modifiables.</p>
          <label className="small">Domaines<textarea className="textarea" name="domains" style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 13 }} defaultValue={refsToText(refs.domains)} /></label>
          <label className="small">Angles<textarea className="textarea" name="angles" style={{ minHeight: 150, fontFamily: 'var(--font-mono)', fontSize: 13 }} defaultValue={refsToText(refs.angles)} /></label>
        </section>
        <div><button className="btn">Enregistrer les réglages</button></div>
      </form>
    </>
  );
}
