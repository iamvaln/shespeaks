import { verifyAction } from '../actions';
export const dynamic = 'force-dynamic';
// A confirmation click (POST) prevents mail scanners that pre-fetch links from consuming the one-time token.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="login-wrap">
      <form action={verifyAction} className="login-card card card-lg stack">
        <p className="label-s">ESPACE COACH</p>
        <h1 className="display-l" style={{ fontSize: 30 }}>Terminer la connexion</h1>
        <input type="hidden" name="token" value={token ?? ''} />
        <button className="btn">Entrer dans l’espace coach</button>
      </form>
    </div>
  );
}
