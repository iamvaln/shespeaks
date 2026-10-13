'use client';
import { useState } from 'react';

type D = { codeLabel: string; codeSubmit: string; codeWrong: string; codeResend: string; codeResent: string; limited: string; retry: string };

/** Types back the code received by email: her journey opens in this browser, whatever browser it is. */
export function ResumeCode({ email, d }: { email: string; d: D }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <div className="stack-sm">
      <form className="stack-sm" onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setMsg(null);
        const code = String(new FormData(e.currentTarget).get('code') ?? '');
        const r = await fetch('/api/acces/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) }).catch(() => null);
        const j = (await r?.json().catch(() => null)) as { ok?: boolean; next?: string } | null;
        if (r?.ok && j?.ok && j.next) { window.location.assign(j.next); return; }
        setBusy(false);
        setMsg({ text: r?.status === 429 ? d.limited : r && r.status < 500 ? d.codeWrong : d.retry, ok: false });
      }}>
        <label className="field">{d.codeLabel}
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required style={{ letterSpacing: '0.3em', fontSize: 20 }} />
        </label>
        <button className="btn" aria-disabled={busy || undefined}>{d.codeSubmit}</button>
      </form>
      <button type="button" className="link-btn" onClick={async () => {
        setMsg(null);
        const r = await fetch('/api/acces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
        setMsg(r?.status === 429 ? { text: d.limited, ok: false } : r?.ok ? { text: d.codeResent, ok: true } : { text: d.retry, ok: false });
      }}>{d.codeResend}</button>
      {msg && <p role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
