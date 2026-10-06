import { LoginForm } from './LoginForm';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
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
        {sp.expired && <div className="flash err">Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau.</div>}
        <LoginForm />
      </div>
    </div>
  );
}
