'use client';
import { useState } from 'react';
import { accessOutcome, type AccessOutcome } from '@/lib/access-outcome';
import { ResumeCode } from './ResumeCode';

type State = 'idle' | 'busy' | AccessOutcome;

type D = { email: string; send: string; sent: string; limited: string; retry: string; codeLabel: string; codeSubmit: string; codeWrong: string; codeResend: string; codeResent: string };

export function AccessForm({ d }: { d: D }) {
  const [state, setState] = useState<State>('idle');
  const [email, setEmail] = useState('');
  return state === 'sent' ? (
    <div className="stack-sm">
      <p role="status">{d.sent}</p>
      <ResumeCode email={email} d={d} />
    </div>
  ) : (
    <form className="stack-sm" onSubmit={async (e) => {
      e.preventDefault();
      if (state === 'busy') return;
      setState('busy');
      const typed = String(new FormData(e.currentTarget).get('email') ?? '');
      setEmail(typed);
      const r = await fetch('/api/acces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: typed }) }).catch(() => null);
      setState(accessOutcome(r?.status ?? null));
    }}>
      <label className="field">{d.email}<input type="email" name="email" required autoComplete="email" /></label>
      <button className="btn" aria-disabled={state === 'busy' || undefined}>{d.send}</button>
      {state === 'limited' && <p role="alert">{d.limited}</p>}
      {state === 'retry' && <p role="alert">{d.retry}</p>}
    </form>
  );
}
