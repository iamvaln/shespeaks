'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPROACHES, type Approach } from '@/lib/journey';

type IdeasDict = {
  intro: string; approachLabel: string; approachHint: string; approaches: Record<Approach, string>; other: string;
  concrete: string; concreteHint: string; takeaway: string; prepare: string; prepareHint: string; required: string;
};
export type ProposalAnswerDict = { choose: string; none: string; approve: string; changes: string; comment: string; commentRequired: string; commentOptional: string; send: string; error: string; back: string; yourChoice: string; colon: string; ideas: IdeasDict };
export type ChoiceCard = { title: string; formatLabel: string | null; pitch: string };

/** The buttons under a pending proposal: they post to /api/espace/repondre, then reload the page on the next state. */
export function ProposalAnswer({ proposalId, kind, items, formatLabel, d }: { proposalId: number; kind: 'choix' | 'sujet'; items: ChoiceCard[]; formatLabel: string; d: ProposalAnswerDict }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | { response: string; choice?: number; required: boolean; title?: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const post = async (response: string, choice: number | undefined, comment: string, ideas?: unknown) => {
    if (busy) return;
    setBusy(true); setError('');
    const r = await fetch('/api/espace/repondre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId, response, choice, comment, ideas }) }).catch(() => null);
    if (r?.ok) { router.refresh(); return; }
    setBusy(false);
    setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? d.error);
    router.refresh();
  };
  if (mode) {
    return (
      <form className="stack-sm" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const comment = String(f.get('comment') ?? '');
        if (mode.response !== 'choisie') { post(mode.response, mode.choice, comment); return; }
        // what she imagines for the track she chose: at least one way to approach it, the rest is optional
        const ideas = { approach: f.getAll('approach').map(String), other: String(f.get('other') ?? ''), concrete: String(f.get('concrete') ?? ''), takeaway: String(f.get('takeaway') ?? ''), prepare: String(f.get('prepare') ?? '') };
        if (!ideas.approach.length && !ideas.other.trim()) { setError(d.ideas.required); return; }
        post(mode.response, mode.choice, comment, ideas);
      }}>
        {mode.title && <p><strong>{d.yourChoice}</strong>{d.colon}{mode.title}</p>}
        {mode.response === 'choisie' && (
          <>
            <p className="small">{d.ideas.intro}</p>
            <fieldset className="field">
              <legend>{d.ideas.approachLabel}</legend>
              <span className="small">{d.ideas.approachHint}</span>
              <div className="opts">{APPROACHES.map((a) => <label key={a} className="opt"><input type="checkbox" name="approach" value={a} />{d.ideas.approaches[a]}</label>)}</div>
              <input name="other" maxLength={600} aria-label={d.ideas.other} placeholder={d.ideas.other} style={{ marginTop: 8 }} />
            </fieldset>
            <label className="field">{d.ideas.concrete}<span className="small">{d.ideas.concreteHint}</span><textarea name="concrete" maxLength={600} rows={2} /></label>
            <label className="field">{d.ideas.takeaway}<textarea name="takeaway" maxLength={600} rows={2} /></label>
            <label className="field">{d.ideas.prepare}<span className="small">{d.ideas.prepareHint}</span><textarea name="prepare" maxLength={600} rows={2} /></label>
          </>
        )}
        <label className="field">{mode.required ? d.commentRequired : d.commentOptional}<textarea name="comment" maxLength={1000} required={mode.required} rows={3} /></label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" aria-disabled={busy || undefined}>{d.send}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode(null); setError(''); }}>{d.back}</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <div className="stack-sm">
      {kind === 'choix' && (
        <ol className="stack-sm">
          {items.map((it, k) => (
            <li key={k}>
              <strong>{it.title}</strong>
              {it.formatLabel && <><br /><span className="small">{formatLabel}{d.colon}{it.formatLabel}</span></>}
              <br />{it.pitch}
              <div><button className="btn" onClick={() => setMode({ response: 'choisie', choice: k, required: false, title: it.title })}>{d.choose}</button></div>
            </li>
          ))}
        </ol>
      )}
      {kind === 'choix'
        ? <button className="btn btn-ghost" onClick={() => setMode({ response: 'aucune', required: true })}>{d.none}</button>
        : <><button className="btn" onClick={() => setMode({ response: 'approuvee', required: false })}>{d.approve}</button>
            <button className="btn btn-ghost" onClick={() => setMode({ response: 'changements', required: true })}>{d.changes}</button></>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
