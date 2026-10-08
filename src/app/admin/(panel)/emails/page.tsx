import Link from 'next/link';
import { all } from '@/lib/db';
import { fmtDate } from '@/lib/i18n';
import { mailConfigured } from '@/lib/mail';
import { requireCoach } from '@/lib/auth';
import { one } from '@/lib/admin-format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Emails' };

const KINDS: Record<string, string> = {
  candidate_started: 'Candidate · parcours commencé', candidate_confirmation: 'Candidate · confirmation de réception',
  candidate_reminder_1: 'Candidate · relance 1', candidate_reminder_2: 'Candidate · relance 2', candidate_reminder_manual: 'Candidate · rappel manuel',
  coach_new_diagnostic: 'Coach · nouvel intérêt', coach_stalled_digest: 'Coach · relances à faire', coach_login: 'Coach · connexion', coach_invite: 'Coach · invitation',
};
// Reminders are numbered up to the maximum set in Paramètres (1 to 10), so their labels are built, not listed.
const kindLabel = (kind: string) => {
  const n = /^candidate_reminder_(\d+)$/.exec(kind)?.[1];
  return KINDS[kind] ?? (n ? `Candidate · relance ${n}` : kind);
};
const STATUS: Record<string, [string, string]> = { sent: ['envoyé', 'is-green'], failed: ['échec', 'is-red'], logged: ['journalisé', ''] };

export default async function Emails({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  await requireCoach();
  const sp = await searchParams;
  const rows = await all<{ id: number; kind: string; to_addr: string; subject: string; status: string; error: string | null; at: string; body_text: string; candidate_id: number | null }>(
    'SELECT * FROM email_log ORDER BY id DESC LIMIT 200');
  const open = rows.find((r) => String(r.id) === one(sp.id));
  return (
    <div className="a-page" style={{ gap: 20 }}>
      <div>
        <h1 className="a-h1" style={{ margin: 0 }}>Emails</h1>
        <p className="a-muted" style={{ margin: '8px 0 0', maxWidth: '80ch' }}>{mailConfigured() ? 'Resend configuré : « envoyé » = accepté par Resend (l’identifiant du message est conservé pour le retrouver dans le tableau de bord Resend).' : 'Resend non configuré : les emails sont enregistrés ici (« journalisé ») mais pas envoyés. Renseigne RESEND_API_KEY et MAIL_FROM dans l’environnement pour les envoyer.'}</p>
      </div>

      {open && (
        <section className="a-card a-stack" aria-labelledby="h-mail">
          <div className="a-row-between" style={{ flexWrap: 'wrap' }}>
            <span className="a-sub" style={{ whiteSpace: 'normal' }}>{kindLabel(open.kind)} · à {open.to_addr} · {fmtDate(open.at, 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
            <Link href="/admin/emails" className="a-more">Fermer</Link>
          </div>
          <h2 id="h-mail" className="a-h2">{open.subject}</h2>
          <pre className="a-mail">{open.body_text}</pre>
          {open.error && <p className="flash err" role="alert" style={{ margin: 0 }}>Erreur : {open.error}</p>}
        </section>
      )}

      <section className="a-card is-flush" aria-label="Emails envoyés">
        {rows.length === 0 ? <p className="a-empty">Aucun email pour le moment.</p> : (
          <div role="table" aria-label="Emails" style={{ ['--cols']: '112px minmax(0,1.6fr) minmax(0,1.5fr) minmax(0,2fr) 112px' } as React.CSSProperties}>
            <div role="row" className="a-th">
              <span role="columnheader">Date</span><span role="columnheader" className="a-hide-s">Type</span><span role="columnheader" className="a-hide-s">Destinataire</span><span role="columnheader">Objet</span><span role="columnheader">Statut</span>
            </div>
            {rows.map((r) => {
              const [label, tone] = STATUS[r.status] ?? STATUS.logged;
              return (
                <div role="row" className="a-tr" key={r.id}>
                  <span role="cell" className="a-muted">{fmtDate(r.at, 'fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span role="cell" className="a-trunc a-hide-s">{kindLabel(r.kind)}</span>
                  <span role="cell" className="a-trunc a-hide-s">{r.to_addr}</span>
                  <span role="cell" style={{ minWidth: 0 }}>
                    <Link href={`/admin/emails?id=${r.id}`} className="a-name a-stretch" style={{ fontWeight: 600 }}>{r.subject}</Link>
                    <span className="a-sub a-only-s">{kindLabel(r.kind)} · {r.to_addr}</span>
                  </span>
                  <span role="cell"><span className={`a-pill ${tone}`}>{label}</span></span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
