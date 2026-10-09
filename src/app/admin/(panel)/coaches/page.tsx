import { listCoaches } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';
import { requireCoach } from '@/lib/auth';
import { inviteCoachAction, toggleCoachAction } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Coachs' };
export default async function Coaches({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await requireCoach();
  const coaches = await listCoaches();
  return (
    <>
      <h1>Coachs</h1>
      {sp.msg && <div className="flash" role="status">{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert">{sp.err}</div>}
      <div className="table-wrap" style={{ marginBottom: 32 }}>
        <table className="t">
          <thead><tr><th>Nom</th><th>Email</th><th>WhatsApp</th><th className="num">Candidates suivies</th><th>Accès</th><th></th></tr></thead>
          <tbody>{coaches.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong>{c.id === me.id ? <span className="small"> (toi)</span> : null}<div className="small">depuis le {fmtDate(c.created_at, 'fr')}</div></td>
              <td>{c.email}</td><td>{c.whatsapp ?? '—'}</td><td className="num">{c.load}</td>
              <td><span className={`status ${c.active ? 's-retenue' : 's-non_retenue'}`}>{c.active ? 'Actif' : 'Désactivé'}</span></td>
              <td>{c.id !== me.id && <form action={toggleCoachAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm btn-ghost">{c.active ? 'Désactiver' : 'Réactiver'}</button></form>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <form action={inviteCoachAction} className="card stack" style={{ maxWidth: 640 }}>
        <h2>Inviter une coach</h2>
        <p className="small">Elle reçoit un email avec un lien de connexion. Ensuite, elle se connecte avec son email. Tu pourras lui assigner des candidates depuis leur fiche.</p>
        <div className="grid grid-2">
          <label className="small">Nom<input className="input" name="name" required /></label>
          <label className="small">Email<input className="input" type="email" name="email" required /></label>
          <label className="small">WhatsApp (facultatif)<input className="input" name="whatsapp" /></label>
        </div>
        <div><button className="btn">Envoyer l’invitation</button></div>
      </form>
    </>
  );
}
