'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CopyButton({ value, d }: { value: string; d: { copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(value).catch(() => {}); setDone(true); }}>{done ? d.copied : d.copy}</button>;
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
