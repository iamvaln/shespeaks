'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type D = { send: string; sent: string; error: string };

/** The candidate writes to her coach (under one exchange, or on its own): posts to /api/espace/message, then shows the thread again. */
export function MessageForm({ proposalId, label, d }: { proposalId: number | null; label: string; d: D }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="stack-sm" onSubmit={async (e) => {
      e.preventDefault();
      if (busy) return;
      const form = e.currentTarget;
      const body = String(new FormData(form).get('body') ?? '');
      setBusy(true); setMsg(null);
      const r = await fetch('/api/espace/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId, body }) }).catch(() => null);
      setBusy(false);
      if (r?.ok) { form.reset(); setMsg({ ok: true, text: d.sent }); router.refresh(); return; }
      setMsg({ ok: false, text: ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? d.error });
    }}>
      <label className="field">{label}<textarea name="body" required maxLength={2000} rows={3} /></label>
      <div><button className="btn" aria-disabled={busy || undefined}>{d.send}</button></div>
      {msg && <p role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </form>
  );
}
