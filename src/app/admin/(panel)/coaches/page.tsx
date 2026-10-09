import { listCoaches } from '@/lib/data';
import { fmtDate } from '@/lib/i18n';
import { requireCoach } from '@/lib/auth';
import { initials } from '@/lib/text';
import { inviteCoachAction, toggleCoachAction } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Coachs' };
export default async function Coaches({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await requireCoach();
  const coaches = await listCoaches();
  return (
    <div className="a-page" style={{ gap: 20 }}>
      <h1 className="a-h1" style={{ margin: 0 }}>Coachs</h1>
      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert" style={{ margin: 0 }}>{sp.err}</div>}

      <section className="a-card is-flush" aria-label="Coachs">
        <div role="table" aria-label="Coachs" style={{ ['--cols' as string]: 'minmax(0,2.2fr) minmax(0,2fr) minmax(0,1.3fr) 96px 110px 130px', ['--cols-m' as string]: 'minmax(0,2.2fr) minmax(0,2fr) 110px 130px' }}>
          <div role="row" className="a-th">
            <span role="columnheader">Nom</span><span role="columnheader" className="a-hide-s">Email</span><span role="columnheader" className="a-hide-s a-hide-m">WhatsApp</span><span role="columnheader" className="a-hide-s a-hide-m">Candidates</span><span role="columnheader">Accès</span><span role="columnheader"><span className="sr-only">Action</span></span>
          </div>
          {coaches.map((c) => (
            <div role="row" className="a-tr" key={c.id}>
              <div role="cell" className="a-cell-name">
                <span className={`a-coach${c.id === me.id ? ' is-me' : ''}`} aria-hidden="true">{initials(c.name)}</span>
                <span style={{ minWidth: 0 }}>
                  <strong className="a-name">{c.name}{c.id === me.id ? <span className="a-muted" style={{ fontWeight: 400 }}> (toi)</span> : null}</strong>
                  <span className="a-sub">depuis le {fmtDate(c.created_at, 'fr', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span className="a-sub a-only-s">{[c.email, c.whatsapp, `${c.load} candidate${c.load > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span>
                  <span className="a-sub a-m-only">{[c.whatsapp, `${c.load} candidate${c.load > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span>
                </span>
              </div>
              <span role="cell" className="a-trunc a-hide-s" title={c.email}>{c.email}</span>
              <span role="cell" className="a-trunc a-hide-s a-hide-m">{c.whatsapp ?? '—'}</span>
              <span role="cell" className="a-hide-s a-hide-m" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.load}</span>
              <span role="cell"><span className={`a-pill ${c.active ? 'is-green' : 'is-red'}`}>{c.active ? 'Actif' : 'Désactivé'}</span></span>
              <span role="cell">
                {c.id !== me.id && (
                  <form action={toggleCoachAction}><input type="hidden" name="id" value={c.id} /><button className="a-btn is-ghost is-sm">{c.active ? 'Désactiver' : 'Réactiver'}</button></form>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <form action={inviteCoachAction} className="a-card a-stack" style={{ maxWidth: 640 }}>
        <div>
          <h2 className="a-h2">Inviter une coach</h2>
          <p className="a-muted" style={{ margin: '4px 0 0' }}>Elle reçoit un email avec un lien de connexion. Ensuite, elle se connecte avec son email. Tu pourras lui assigner des candidates depuis leur fiche.</p>
        </div>
        <div className="a-grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label className="a-label">Nom<input className="a-input" name="name" required /></label>
          <label className="a-label">Email<input className="a-input" type="email" name="email" required /></label>
          <label className="a-label">WhatsApp (facultatif)<input className="a-input" name="whatsapp" /></label>
        </div>
        <div><button className="a-btn">Envoyer l’invitation</button></div>
      </form>
    </div>
  );
}
