'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type D = { choose: string; none: string; approve: string; changes: string; comment: string; commentRequired: string; commentOptional: string; send: string; error: string };

/** The buttons under a pending proposal: they post to /api/espace/repondre, then reload the page on the next state. */
export function ProposalAnswer({ proposalId, kind, count, d }: { proposalId: number; kind: 'choix' | 'sujet'; count: number; d: D }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | { response: string; choice?: number; required: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const post = async (response: string, choice: number | undefined, comment: string) => {
    if (busy) return;
    setBusy(true); setError('');
    const r = await fetch('/api/espace/repondre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId, response, choice, comment }) }).catch(() => null);
    if (r?.ok) { router.refresh(); return; }
    setBusy(false);
    setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? d.error);
    router.refresh();
  };
  if (mode) {
    return (
      <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); post(mode.response, mode.choice, String(new FormData(e.currentTarget).get('comment') ?? '')); }}>
        <label className="field">{mode.required ? d.commentRequired : d.commentOptional}<textarea name="comment" maxLength={1000} required={mode.required} rows={3} /></label>
        <button className="btn" aria-disabled={busy || undefined}>{d.send}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <div className="stack-sm">
      {kind === 'choix'
        ? <>{Array.from({ length: count }, (_, k) => <button key={k} className="btn" onClick={() => setMode({ response: 'choisie', choice: k, required: false })}>{d.choose} {k + 1}</button>)}
            <button className="btn btn-ghost" onClick={() => setMode({ response: 'aucune', required: true })}>{d.none}</button></>
        : <><button className="btn" onClick={() => setMode({ response: 'approuvee', required: false })}>{d.approve}</button>
            <button className="btn btn-ghost" onClick={() => setMode({ response: 'changements', required: true })}>{d.changes}</button></>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
