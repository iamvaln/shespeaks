import { requireCoach } from '@/lib/auth';
import { AdminNav } from '@/components/AdminNav';
import { logoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const coach = await requireCoach();
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shespeaks-logo-nuit.svg" alt="SheSpeaks" height={36} />
          <AdminNav />
          <form action={logoutAction} className="admin-user">
            <span>{coach.name}</span>
            <button type="submit">Déconnexion</button>
          </form>
        </div>
      </header>
      <main className="admin-main"><div className="container">{children}</div></main>
    </div>
  );
}
