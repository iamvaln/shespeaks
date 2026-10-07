'use client';
import { useState } from 'react';
import type { Locale } from '@/lib/questions';
import { t } from '@/lib/i18n';
import { PhotoManager, type PhotoItem } from './PhotoManager';

/** Photo screen reachable from the roadmap ("Ajouter ma photo plus tard"). */
export function PlanPhotos({ initial, consent: c0, locale }: { initial: PhotoItem[]; consent: boolean; locale: Locale }) {
  const d = t(locale);
  const [photos, setPhotos] = useState(initial);
  const [consent, setConsent] = useState(c0);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);

  async function save() {
    setErr(false);
    if (!consent) { setErr(true); return; }
    await fetch('/api/diag/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) });
    setSaved(true);
  }
  return (
    <section className="card card-lg stack" id="photo">
      <h2 className="title" style={{ fontSize: 22 }}>{d.plan.photoTitle}</h2>
      {photos.length === 0 && <p className="muted">{d.plan.photoMissing}</p>}
      <PhotoManager photos={photos} onChange={(p) => { setPhotos(p); setSaved(false); }} locale={locale} />
      {photos.length > 0 && (
        <div className="stack-sm">
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setSaved(false); setErr(false); }} />
            <span>{d.wiz.photo.consent}</span>
          </label>
          {err && <p style={{ color: 'var(--danger)', margin: 0 }} role="alert">{d.wiz.errors.consent_required}</p>}
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={save}>{d.plan.save}</button>
            {saved && <span className="small" role="status">{d.plan.saved}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
