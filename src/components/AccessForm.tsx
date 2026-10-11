'use client';
import { useState } from 'react';
import { accessOutcome, type AccessOutcome } from '@/lib/access-outcome';

type State = 'idle' | 'busy' | AccessOutcome;

export function AccessForm({ d }: { d: { email: string; send: string; sent: string; limited: string; retry: string } }) {
  const [state, setState] = useState<State>('idle');
  return state === 'sent' ? <p role="status">{d.sent}</p> : (
    <form className="stack-sm" onSubmit={async (e) => {
      e.preventDefault();
      if (state === 'busy') return;
      setState('busy');
      const email = String(new FormData(e.currentTarget).get('email') ?? '');
      const r = await fetch('/api/acces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
      setState(accessOutcome(r?.status ?? null));
    }}>
      <label className="field">{d.email}<input type="email" name="email" required autoComplete="email" /></label>
      <button className="btn" aria-disabled={state === 'busy' || undefined}>{d.send}</button>
      {state === 'limited' && <p role="alert">{d.limited}</p>}
      {state === 'retry' && <p role="alert">{d.retry}</p>}
    </form>
  );
}
