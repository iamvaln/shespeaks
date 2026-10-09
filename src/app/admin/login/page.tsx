import { redirect } from 'next/navigation';
import { getSessionCoach } from '@/lib/auth';
import { LoginForm } from './LoginForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; limited?: string }> }) {
  if (await getSessionCoach()) redirect('/admin'); // already signed in (the footer link brings her here)
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card card card-lg stack">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/shespeaks-logo-clair.svg" alt="SheSpeaks by Techies Connect'" height={52} style={{ height: 52 }} />
        <div>
          <p className="label-s">ESPACE COACH</p>
          <h1 className="display-l" style={{ fontSize: 32, marginTop: 8 }}>Connexion</h1>
        </div>
        {sp.expired && <div className="flash err" role="alert">Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau.</div>}
        {sp.limited && <div className="flash err" role="alert">Trop de tentatives depuis cette connexion. Réessaie dans quelques minutes.</div>}
        <LoginForm />
      </div>
    </div>
  );
}
