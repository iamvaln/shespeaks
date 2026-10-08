import { getSetting } from '@/lib/db';
import { requireCoach } from '@/lib/auth';
import { getRefs, refsToText } from '@/lib/data';
import { mailConfigured } from '@/lib/mail';
import { checkEnv } from '@/lib/env';
import { all } from '@/lib/db';
import { saveSettingsAction } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Paramètres' };
export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireCoach();
  const sp = await searchParams;
  const refs = await getRefs();
  let migrations: string[] | null = null;
  try {
    migrations = (await all<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename')).map((r) => r.filename);
  } catch {
    migrations = null; // table absent: migrations were never run through the tracked runner
  }
  const issues = checkEnv(process.env, { production: process.env.NODE_ENV === 'production' });
  const v = {
    notification_email: await getSetting('notification_email'), reminders_enabled: await getSetting('reminders_enabled'),
    first: await getSetting('reminder_first_hours'), interval: await getSetting('reminder_interval_hours'), max: await getSetting('reminder_max'),
    deadline: await getSetting('internal_deadline'), show: await getSetting('show_tracks_to_candidates'),
  };
  return (
    <div className="a-page" style={{ gap: 20, maxWidth: 860 }}>
      <h1 className="a-h1" style={{ margin: 0 }}>Paramètres</h1>
      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}

      <section className="a-card a-stack" aria-labelledby="h-server">
        <h2 id="h-server" className="a-h2">Configuration du serveur</h2>
        {migrations && migrations.length > 0 ? (
          <p className="a-muted" style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="a-pill is-green">OK</span><span>Base de données : {migrations.length} migration{migrations.length > 1 ? 's' : ''} appliquée{migrations.length > 1 ? 's' : ''}, dernière : <code className="a-code">{migrations[migrations.length - 1]}</code></span></p>
        ) : (
          <p className="a-muted" style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="a-pill is-red">Erreur</span><span>Aucune migration enregistrée : lance <code className="a-code">npm run db:setup</code> sur cette base (ou redéploie : les migrations s’exécutent pendant le build).</span></p>
        )}
        {issues.length === 0 ? (
          <p className="a-muted" style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="a-pill is-green">OK</span><span>Toutes les variables d’environnement attendues sont renseignées.</span></p>
        ) : (
          <>
            <p className="a-muted" style={{ margin: 0 }}>Variables d’environnement à corriger dans Vercel (Project Settings → Environment Variables), puis redéployer. Seuls les noms sont affichés, jamais les valeurs.</p>
            <ul className="a-issues">
              {issues.map((i) => (
                <li key={i.vars.join()}>
                  <span className={`a-pill ${i.level === 'error' ? 'is-red' : 'is-soft'}`}>{i.level === 'error' ? 'Erreur' : 'Attention'}</span>
                  <div style={{ minWidth: 0 }}><strong className="a-code">{i.vars.join(' + ')}</strong><div className="a-muted">{i.message}</div></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <form action={saveSettingsAction} className="a-stack" style={{ gap: 20 }}>
        <section className="a-card a-stack">
          <h2 className="a-h2">Notifications</h2>
          <p className="a-muted" style={{ margin: 0 }}>Chaque formulaire terminé, et chaque relance de candidate inachevée, est envoyé à la coach assignée <strong style={{ color: 'var(--ink)' }}>et</strong> aux adresses ci-dessous. {mailConfigured() ? 'Resend configuré : les emails partent réellement.' : 'RESEND_API_KEY absente : les emails sont seulement enregistrés (voir l’onglet Emails).'}</p>
          <label className="a-label">Email(s) de notification supplémentaires (séparés par des virgules)<input className="a-input" name="notification_email" defaultValue={v.notification_email} placeholder="admin@exemple.com" /></label>
        </section>

        <section className="a-card a-stack">
          <h2 className="a-h2">Relances automatiques</h2>
          <label className="a-check"><input type="checkbox" name="reminders_enabled" defaultChecked={v.reminders_enabled === 'true'} /><span>Relancer les candidates dont le parcours est inachevé (email à la candidate si elle a laissé une adresse, alerte à la coach dans tous les cas)</span></label>
          <div className="a-grid-3">
            <label className="a-label">1re relance après (heures)<input className="a-input" type="number" min={1} name="reminder_first_hours" defaultValue={v.first} /></label>
            <label className="a-label">Intervalle entre relances (heures)<input className="a-input" type="number" min={1} name="reminder_interval_hours" defaultValue={v.interval} /></label>
            <label className="a-label">Nombre maximum de relances<input className="a-input" type="number" min={1} max={10} name="reminder_max" defaultValue={v.max} /></label>
          </div>
        </section>

        <section className="a-card a-stack">
          <h2 className="a-h2">Calendrier interne</h2>
          <label className="a-label">Date limite interne (relecture avant les clôtures officielles)<input className="a-input" type="date" name="internal_deadline" defaultValue={v.deadline} style={{ maxWidth: 260 }} /></label>
        </section>

        <section className="a-card a-stack">
          <h2 className="a-h2">Pistes de sujets</h2>
          <label className="a-check"><input type="checkbox" name="show_tracks_to_candidates" defaultChecked={v.show === 'true'} /><span>Afficher les pistes (non écartées) directement à la candidate sur son plan de route. Désactivé pendant la phase de test : la coach relit d’abord les pistes.</span></label>
        </section>

        <section className="a-card a-stack">
          <h2 className="a-h2">Référentiels</h2>
          <p className="a-muted" style={{ margin: 0 }}>Une ligne par entrée : <code className="a-code">identifiant | libellé français | libellé anglais</code>. Pour les angles, les identifiants sont fixes (ils déterminent les modèles de titre) : seuls les libellés sont modifiables.</p>
          <label className="a-label">Domaines<textarea className="a-textarea is-mono" name="domains" style={{ minHeight: 220 }} defaultValue={refsToText(refs.domains)} /></label>
          <label className="a-label">Angles<textarea className="a-textarea is-mono" name="angles" style={{ minHeight: 150 }} defaultValue={refsToText(refs.angles)} /></label>
        </section>
        <div><button className="a-btn">Enregistrer les réglages</button></div>
      </form>
    </div>
  );
}
