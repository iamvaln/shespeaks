'use client';
import { useActionState } from 'react';
import { loginAction } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  if (state?.sent)
    return (
      <div className="stack-sm" role="status">
        <div className="flash">Si cette adresse correspond à une coach, un lien de connexion vient de lui être envoyé. Il est valable 15 minutes.</div>
        {state.devLink && (
          <p className="small">Mode développement (Resend non configuré) : <a href={state.devLink}>ouvrir le lien de connexion</a></p>
        )}
      </div>
    );
  return (
    <form action={action} className="stack">
      {state?.retryMinutes && (
        <div className="flash err" role="alert">
          Trop de demandes de lien. Vérifie ta boîte mail (les liens déjà envoyés restent valables 15 minutes) ou réessaie dans {state.retryMinutes} minute{state.retryMinutes > 1 ? 's' : ''}.
        </div>
      )}
      <div className="q" style={{ marginBottom: 0 }}>
        <label className="q-label" htmlFor="email">Ton email de coach</label>
        <p className="help">On t’envoie un lien de connexion, sans mot de passe.</p>
        <input id="email" name="email" type="email" required autoComplete="email" maxLength={254} defaultValue={state?.email ?? ''} className="input" />
      </div>
      <button className="btn" disabled={pending}>{pending ? 'Envoi…' : 'Recevoir mon lien'}</button>
    </form>
  );
}
