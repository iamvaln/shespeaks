import { getSetting } from '@/lib/db';
import { requireCoach } from '@/lib/auth';
import { getRefs, listEvents, refsToText } from '@/lib/data';
import { calendarWarnings } from '@/lib/calendar';
import { dayOf, todayIso } from '@/lib/dates';
import { mailConfigured } from '@/lib/mail';
import { checkEnv } from '@/lib/env';
import { all } from '@/lib/db';
import { recoverStuckAction, saveSettingsAction } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Paramètres' };
export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireCoach();
  const sp = await searchParams;
  const refs = await getRefs();
  let migrations: string[] | null = null;
  try {
    migrations = (await all<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename')).map((r) => r.filename);
  } catch {
    migrations = null; // table absent: migrations were never run through the tracked runner
  }
  const stuck = await all<{ id: number; name: string | null; email: string | null; last_activity_at: string }>(`SELECT id, name, email, last_activity_at FROM candidates WHERE current_screen='done' AND completed_at IS NULL ORDER BY id`);
  const issues = checkEnv(process.env, { production: process.env.NODE_ENV === 'production' });
  const v = {
    notification_email: await getSetting('notification_email'), reminders_enabled: await getSetting('reminders_enabled'),
    first: await getSetting('reminder_first_hours'), interval: await getSetting('reminder_interval_hours'), max: await getSetting('reminder_max'),
    deadline: await getSetting('internal_deadline'),
    interest: await getSetting('interest_deadline'), rehearsal: await getSetting('rehearsal_date'), rehearsalInfo: await getSetting('rehearsal_info'),
    calendarReminders: await getSetting('calendar_reminders_enabled'),
    focus: await getSetting('topic_focus'),
  };
  const warnings = calendarWarnings({ interestDeadline: v.interest, internalDeadline: v.deadline, rehearsalDate: v.rehearsal, events: await listEvents() });
  return (
    <div className="a-page" style={{ gap: 20, maxWidth: 860 }}>
      <h1 className="a-h1" style={{ margin: 0 }}>Paramètres</h1>
      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert" style={{ margin: 0 }}>{sp.err}</div>}

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

      {stuck.length > 0 && (
        <section className="a-card a-stack" aria-labelledby="h-stuck">
          <h2 id="h-stuck" className="a-h2">Dossiers bloqués ({stuck.length})</h2>
          <p className="a-muted" style={{ margin: 0 }}>Ces candidates ont envoyé la dernière page du formulaire, mais leur dossier n’a pas été finalisé (il apparaît « En cours », sans date de fin, et personne n’a été prévenu). Le bouton les finalise comme à l’envoi de la dernière page : statut « Intérêt reçu », ligne du sujet, email de confirmation à la candidate et notification aux coachs. La date de fin reprend le jour de leur dernier envoi.</p>
          <ul className="a-issues" aria-label="Dossiers bloqués">
            {stuck.slice(0, 30).map((c) => (
              <li key={c.id}><span className="a-pill is-soft">#{c.id}</span><div style={{ minWidth: 0 }}><a href={`/admin/candidates/${c.id}`}>{c.name || 'Sans nom'}</a><div className="a-muted">{c.email || 'pas d’email'} · dernier envoi le {(dayOf(c.last_activity_at) ?? '').split('-').reverse().join('/')}</div></div></li>
            ))}
          </ul>
          <form action={recoverStuckAction}><button className="a-btn">Finaliser les dossiers bloqués ({stuck.length})</button></form>
        </section>
      )}

      <form action={saveSettingsAction} className="a-stack" style={{ gap: 20 }}>
        <section className="a-card a-stack">
          <h2 className="a-h2">Notifications</h2>
          <p className="a-muted" style={{ margin: 0 }}>Chaque formulaire terminé, et chaque relance de candidate inachevée, est envoyé à la coach assignée <strong style={{ color: 'var(--ink)' }}>et</strong> aux adresses ci-dessous. {mailConfigured() ? 'Resend configuré : les emails partent réellement.' : 'RESEND_API_KEY absente : les emails sont seulement enregistrés (voir la page Emails).'}</p>
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

        <section className="a-card a-stack" aria-labelledby="h-calendar">
          <h2 id="h-calendar" className="a-h2">Calendrier commun</h2>
          <p className="a-muted" style={{ margin: 0 }}>Trois dates valent pour toutes les candidates. La date limite des intérêts vaut toute la journée du jour dit (heure du Cameroun) : le lendemain, plus aucune candidature n’est acceptée. Le jour de répétition laisse au moins deux semaines de préparation entre le dernier intérêt reçu et la répétition. Seuls les événements qui ont une date, postérieure au jour de répétition, sont proposés aux candidates.</p>
          <div className="a-grid-3">
            <label className="a-label">Dernier jour pour envoyer son intérêt<input className="a-input" type="date" name="interest_deadline" defaultValue={v.interest} /></label>
            <label className="a-label">Date limite interne (relecture avant les clôtures officielles)<input className="a-input" type="date" name="internal_deadline" defaultValue={v.deadline} /></label>
            <label className="a-label">Jour de répétition (pour toutes)<input className="a-input" type="date" name="rehearsal_date" defaultValue={v.rehearsal} /></label>
          </div>
          <label className="a-label">Répétition : lieu, heure, lien (texte libre, repris dans les emails)<input className="a-input" name="rehearsal_info" defaultValue={v.rehearsalInfo} maxLength={300} placeholder="Ex. visioconférence à 18 h, lien envoyé la veille" /></label>
          <label className="a-check"><input type="checkbox" name="calendar_reminders_enabled" defaultChecked={v.calendarReminders === 'true'} /><span>Envoyer les relances du calendrier (clôture du formulaire, échanges, soumission, préparation). Décoché : aucune de ces relances ne part.</span></label>
          {warnings.length > 0 && (
            <ul className="a-issues" aria-label="Points à vérifier dans le calendrier">
              {warnings.map((w) => (
                <li key={w}><span className="a-pill is-soft">Attention</span><div style={{ minWidth: 0 }}>{w}</div></li>
              ))}
            </ul>
          )}
          <p className="a-sub" style={{ fontWeight: 400, whiteSpace: 'normal', margin: 0 }}>Aujourd’hui : {todayIso().split('-').reverse().join('/')}. Ces avertissements ne bloquent rien.</p>
        </section>

        <section className="a-card a-stack">
          <h2 className="a-h2">Pistes de sujets</h2>
          <p className="a-muted" style={{ margin: 0 }}>La candidate ne voit jamais les pistes : seulement ce que sa coach lui envoie depuis la fiche (choix de sujets, sujet ajusté).</p>
          <label className="a-label">
            Orientation des sujets (tous les événements)
            <textarea className="a-textarea" name="topic_focus" maxLength={600} style={{ minHeight: 110 }} defaultValue={v.focus} />
            <span className="a-sub" style={{ fontWeight: 400, whiteSpace: 'normal' }}>Transmise à l’IA pour toutes les candidates, comme une priorité à appliquer quand elle correspond à ce que fait la candidate. Vide : aucune orientation. Le thème propre à chaque événement se règle dans Événements.</span>
          </label>
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
