'use client';
import { useRef, useState } from 'react';
import type { Locale } from '@/lib/questions';
import { t } from '@/lib/i18n';

export interface PhotoItem { id: number; width: number | null; height: number | null; size: number }

export function PhotoManager({
  photos, onChange, locale, max = 3,
}: { photos: PhotoItem[]; onChange: (p: PhotoItem[]) => void; locale: Locale; max?: number }) {
  const d = t(locale).wiz.photo;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const removeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let list = photos;
    for (const file of Array.from(files)) {
      if (list.length >= max) { setError(d.errors.too_many); break; }
      if (file.size > 10 * 1024 * 1024) { setError(d.errors.too_big); continue; }
      try {
        // 1) ask the server for an upload target (it also validates size / type / count)
        const sr = await fetch('/api/diag/photo/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: file.size, type: file.type }) });
        const target = await sr.json();
        if (!sr.ok) { setError(d.errors[target.error as string] ?? d.errors.network); continue; }
        let r: Response;
        if (target.mode === 'supabase') {
          // 2) browser → Supabase Storage directly (no 4.5 MB function limit)
          const fd = new FormData();
          fd.append('cacheControl', '3600');
          fd.append('', file);
          const up = await fetch(target.signedUrl, { method: 'PUT', body: fd });
          if (!up.ok) { setError(d.errors.network); continue; }
          // 3) tell the server, which re-validates what landed in Storage
          r = await fetch('/api/diag/photo/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: target.path }) });
        } else {
          const fd = new FormData();
          fd.append('file', file);
          r = await fetch('/api/diag/photo', { method: 'POST', body: fd });
        }
        const j = await r.json();
        if (!r.ok) { setError(d.errors[j.error as string] ?? d.errors.network); continue; }
        list = j.photos as PhotoItem[];
        onChange(list);
        setStatus(d.added(list.length, max));
      } catch { setError(d.errors.network); }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const r = await fetch(`/api/diag/photo?id=${id}`, { method: 'DELETE' });
      if (r.ok) {
        const next = (await r.json()).photos as PhotoItem[];
        onChange(next);
        setStatus(d.removedMsg(next.length, max));
        // the focused button is about to disappear: move focus somewhere that still exists
        setTimeout(() => (removeRefs.current.find(Boolean) ?? input.current)?.focus(), 0);
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      <ul className="tips">{d.tips.map((x) => <li key={x}>{x}</li>)}</ul>
      {photos.length < max && (
        <label className="dropzone">
          <input ref={input} type="file" accept="image/jpeg,image/png" multiple className="sr-only" aria-busy={busy} onChange={(e) => { if (!busy) upload(e.target.files); }} />
          <strong>{busy ? '…' : d.drop}</strong>
          <span className="small" style={{ display: 'block' }}>{d.dropHint}</span>
        </label>
      )}
      {error && <p className="err" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      {photos.length === 0 ? (
        <div className="row">
          <div className="ring" aria-hidden="true"><div>{d.none}</div></div>
          <p className="small" style={{ maxWidth: 260 }}>{d.preview}</p>
        </div>
      ) : (
        <>
          <p className="small">{d.preview}</p>
          <div className="photo-grid">
            {photos.map((p, i) => (
              <div className="photo-item" key={p.id}>
                <div className="ring"><div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/photos/${p.id}`} alt="" /></div></div>
                {p.width && p.height && Math.min(p.width, p.height) < 1000 && <p className="small" style={{ margin: 0 }}>{d.small}</p>}
                <button type="button" className="link-btn" ref={(el) => { removeRefs.current[i] = el; }} onClick={() => remove(p.id)} aria-disabled={busy} aria-label={`${d.remove} ${i + 1}`}>{d.remove}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
