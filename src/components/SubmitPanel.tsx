'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CopyButton({ value, d }: { value: string; d: { copy: string; copied: string; copyFailed: string } }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setState('done'); } catch { setState('failed'); }
      }}>{state === 'done' ? d.copied : d.copy}</button>
      {state === 'failed' && <span role="alert" className="small"> {d.copyFailed}</span>}
    </>
  );
}

export function SubmittedButton({ label, error }: { label: string; error: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <>
      <button className="btn" aria-disabled={busy || undefined} onClick={async () => {
        if (busy) return; setBusy(true);
        const r = await fetch('/api/espace/soumis', { method: 'POST' }).catch(() => null);
        if (r?.ok) { router.refresh(); return; }
        setBusy(false); setMsg(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? error);
      }}>{label}</button>
      {msg && <p role="alert">{msg}</p>}
    </>
  );
}
