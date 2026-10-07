import Link from 'next/link';
import { all } from '@/lib/db';
import { fmtDate } from '@/lib/i18n';
import { mailConfigured } from '@/lib/mail';

export const dynamic = 'force-dynamic';

const KINDS: Record<string, string> = {
  candidate_started: 'Candidate · parcours commencé', candidate_confirmation: 'Candidate · confirmation de réception',
  candidate_reminder_1: 'Candidate · relance 1', candidate_reminder_2: 'Candidate · relance 2', candidate_reminder_manual: 'Candidate · rappel manuel',
  coach_new_diagnostic: 'Coach · nouveau diagnostic', coach_stalled_digest: 'Coach · relances à faire', coach_login: 'Coach · connexion', coach_invite: 'Coach · invitation',
};

export default async function Emails({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const rows = await all<{ id: number; kind: string; to_addr: string; subject: string; status: string; error: string | null; at: string; body_text: string; candidate_id: number | null }>(
    'SELECT * FROM email_log ORDER BY id DESC LIMIT 200');
  const open = rows.find((r) => String(r.id) === sp.id);
  return (
    <>
      <h1>Emails</h1>
      <p className="muted" style={{ marginBottom: 16 }}>{mailConfigured() ? 'Resend configuré : « envoyé » = accepté par Resend (l’identifiant du message est conservé pour le retrouver dans le tableau de bord Resend).' : 'Resend non configuré : les emails sont enregistrés ici (« journalisé ») mais pas envoyés. Renseigne RESEND_API_KEY et MAIL_FROM dans l’environnement pour les envoyer.'}</p>
      {open && (
        <section className="card" style={{ marginBottom: 24 }}>
          <div className="small">{KINDS[open.kind] ?? open.kind} · à {open.to_addr}</div>
          <h2>{open.subject}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{open.body_text}</pre>
          {open.error && <p className="flash err" style={{ marginTop: 12 }}>Erreur : {open.error}</p>}
          <p style={{ marginTop: 12 }}><Link href="/admin/emails">Fermer</Link></p>
        </section>
      )}
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Date</th><th>Type</th><th>Destinataire</th><th>Objet</th><th>Statut</th></tr></thead>
        <tbody>{rows.length === 0 && <tr><td colSpan={5} className="muted">Aucun email pour le moment.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="small">{fmtDate(r.at, 'fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{KINDS[r.kind] ?? r.kind}</td><td>{r.to_addr}</td>
              <td><Link href={`/admin/emails?id=${r.id}`}>{r.subject}</Link></td>
              <td><span className={`status ${r.status === 'sent' ? 's-retenue' : r.status === 'failed' ? 's-non_retenue' : ''}`}>{r.status === 'sent' ? 'envoyé' : r.status === 'failed' ? 'échec' : 'journalisé'}</span></td>
            </tr>))}</tbody>
      </table></div>
    </>
  );
}
