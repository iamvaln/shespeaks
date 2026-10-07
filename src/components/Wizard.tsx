'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SCREENS, SELF_CHECKS, flowFor, totalSteps, visibleQuestions, resolveOptions,
  type Answers, type Answer, type Branch, type Locale, type Question, type Refs,
} from '@/lib/questions';
import { assembleAbstract } from '@/lib/abstract';
import { autoChecks } from '@/lib/review';
import { wordCount } from '@/lib/text';
import { t } from '@/lib/i18n';
import { PhotoManager, type PhotoItem } from './PhotoManager';

export interface WizardInit {
  candidate: { name: string; branch: Branch | null; current: string; completed: boolean; locale: Locale } | null;
  answers: Answers;
  refs: Refs;
  photos: PhotoItem[];
  consent: boolean;
}

export function Wizard({ init, locale }: { init: WizardInit; locale: Locale }) {
  const d = t(locale).wiz;
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(init.answers);
  const [screenId, setScreenId] = useState<string>(init.candidate && init.candidate.current !== 'done' ? init.candidate.current : 'profile');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>(init.photos);
  const [consent, setConsent] = useState(init.consent);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(SELF_CHECKS.map((s) => [s.code, init.answers[`chk_${s.code}`] === '1'])));
  const [abstractEdited, setAbstractEdited] = useState(() => {
    const stored = init.answers['C-abstract'];
    return typeof stored === 'string' && stored.trim() !== assembleAbstract(init.answers, locale).trim();
  });
  const head = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const branch = (answers['D6'] as Branch | undefined) ?? null;
  const flow = flowFor(branch);
  const screen = SCREENS[screenId];
  const idx = Math.max(0, flow.indexOf(screenId));
  const total = totalSteps(branch);
  const questions = useMemo(() => visibleQuestions(screen, answers), [screen, answers]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
    head.current?.focus();
  }, [screenId]);

  const set = (code: string, v: Answer) => {
    setAnswers((a) => ({ ...a, [code]: v }));
    if (errors[code]) setErrors((e) => { const n = { ...e }; delete n[code]; return n; });
  };

  function enter(next: string, a: Answers) {
    if (next === 'c2' && !abstractEdited) a = { ...a, 'C-abstract': assembleAbstract(a, locale) };
    setAnswers(a);
    setScreenId(next);
  }

  async function submit(later = false) {
    setBusy(true);
    setBanner(null);
    const values: Answers = {};
    for (const q of questions) if (answers[q.code] !== undefined) values[q.code] = answers[q.code];
    if (screen.kind === 'review') for (const s of SELF_CHECKS) values[`chk_${s.code}`] = checks[s.code] ? '1' : '';
    if (screen.kind === 'photo') { values['consent'] = consent ? '1' : ''; values['later'] = later ? '1' : ''; }
    try {
      const r = await fetch('/api/diag/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ screen: screenId, values }) });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        if (j.fatal === 'already_completed') { router.replace('/plan'); return; }
        setErrors(j.errors ?? {});
        setBanner(d.fixErrors);
        const firstErr = Object.keys(j.errors ?? {})[0];
        if (firstErr) requestAnimationFrame(() => document.getElementById(`q-${firstErr}`)?.focus());
        setBusy(false);
        return;
      }
      setErrors({});
      if (j.completed) { router.replace('/plan?done=1'); return; }
      const a = { ...answers };
      if (screen.kind === 'review') for (const s of SELF_CHECKS) a[`chk_${s.code}`] = checks[s.code] ? '1' : '0';
      enter(j.next, a);
    } catch {
      setBanner(d.networkError);
    }
    setBusy(false);
  }

  function back() {
    if (idx > 0) { setErrors({}); setBanner(null); setScreenId(flow[idx - 1]); }
  }

  const isPhoto = screen.kind === 'photo';
  const pct = Math.round(((idx + 1) / total) * 100);

  return (
    <div className="form-shell">
      <div className="container form-container">
        <div className="progress" role="group" aria-label={d.screenOf(idx + 1, total)}>
          <p className="label-s muted">{d.screenOf(idx + 1, total)}</p>
          <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{ width: `${pct}%` }} /></div>
        </div>

        <form className="form-card" onSubmit={(e) => { e.preventDefault(); if (!isPhoto) submit(); }} noValidate>
          <header className="form-head">
            <p className="form-block">{screen.block[locale]}</p>
            <h1 className="form-title" ref={head} tabIndex={-1}>{screen.title[locale]}</h1>
            {screen.intro && <p className="form-intro">{screen.intro[locale]}</p>}
          </header>

          {banner && <div className="banner" role="alert">{banner}</div>}

          {questions.map((q) => (
            screen.kind === 'draft' ? (
              <DraftField key={q.code} q={q} locale={locale} value={String(answers[q.code] ?? '')} error={errors[q.code]}
                onChange={(v) => { set(q.code, v); setAbstractEdited(v.trim() !== assembleAbstract(answers, locale).trim()); }}
                onReset={() => { setAbstractEdited(false); set(q.code, assembleAbstract(answers, locale)); }} />
            ) : (
              <Field key={q.code} q={q} locale={locale} refs={init.refs} value={answers[q.code]} error={errors[q.code]} onChange={(v) => set(q.code, v)} />
            )
          ))}

          {screen.kind === 'review' && <ReviewGrid locale={locale} title={String(answers['D1-a'] ?? '')} abstract={String(answers['D1-b'] ?? '')} checks={checks} setChecks={setChecks} />}

          {isPhoto && (
            <div className="stack">
              <PhotoManager photos={photos} onChange={setPhotos} locale={locale} />
              {photos.length > 0 && (
                <div className="q">
                  <label className="check">
                    <input id="q-consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors({}); }} aria-invalid={!!errors.consent} />
                    <span>{d.photo.consent}</span>
                  </label>
                  {errors.consent && <p className="err">{d.errors[errors.consent]}</p>}
                </div>
              )}
              {errors.photo && <p className="err" style={{ color: 'var(--danger)' }}>{d.errors[errors.photo]}</p>}
            </div>
          )}

          <div className="form-actions">
            {idx > 0 ? <button type="button" className="btn btn-ghost" onClick={back} disabled={busy}>{d.back}</button> : <span />}
            <div className="grow">
              {isPhoto ? (
                <>
                  <button type="button" className="btn btn-ghost" disabled={busy || photos.length > 0} onClick={() => submit(true)}>{d.later}</button>
                  <button type="button" className="btn" disabled={busy || photos.length === 0} onClick={() => submit(false)}>{busy ? d.saving : d.finish}</button>
                </>
              ) : (
                <button type="submit" className="btn" disabled={busy}>{busy ? d.saving : d.next}</button>
              )}
            </div>
          </div>
          <p className="small form-note">{d.saved}</p>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Field({ q, locale, refs, value, error, onChange }: {
  q: Question; locale: Locale; refs: Refs; value: Answer | undefined; error?: string; onChange: (v: Answer) => void;
}) {
  const d = t(locale).wiz;
  const id = `q-${q.code}`;
  const errId = `${id}-err`;
  const opts = resolveOptions(q, refs);
  const label = (
    <>
      {q.label[locale]}
      {!q.required && <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}> · {d.optional}</span>}
    </>
  );
  const help = (q.help || q.type === 'multi') && (
    <p className="help">{q.help?.[locale] ?? ''}{q.type === 'multi' && q.max ? ` ${d.pickUpTo(q.max)}` : ''}</p>
  );
  const err = error && <p className="err" id={errId} role="alert">{d.errors[error] ?? error}</p>;

  if (q.type === 'single' || q.type === 'multi' || q.type === 'scale') {
    const selected = q.type === 'multi' ? ((value as string[] | undefined) ?? []) : value === undefined ? [] : [String(value)];
    const items = q.type === 'scale' ? [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })) : opts.map((o) => ({ value: o.value, label: o.label[locale] }));
    const short = q.type !== 'scale' && items.length >= 4 && items.every((o) => o.label.length <= 22);
    return (
      <fieldset className="q" aria-describedby={error ? errId : undefined}>
        <legend>{label}</legend>
        {help}
        <div className={q.type === 'scale' ? 'scale' : `opts${short ? ' cols' : ''}`} role={q.type === 'multi' ? 'group' : 'radiogroup'}>
          {items.map((o, i) => {
            const checked = selected.includes(o.value);
            const atMax = q.type === 'multi' && !!q.max && selected.length >= q.max && !checked;
            return (
              <label className={q.type === 'scale' ? 'scale-opt' : 'opt'} key={o.value}>
                <input
                  id={i === 0 ? id : undefined}
                  type={q.type === 'multi' ? 'checkbox' : 'radio'}
                  name={q.code}
                  value={o.value}
                  checked={checked}
                  disabled={atMax}
                  onChange={() => {
                    if (q.type === 'multi') onChange(checked ? selected.filter((x) => x !== o.value) : [...selected, o.value]);
                    else onChange(q.type === 'scale' ? Number(o.value) : o.value);
                  }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
        {q.type === 'scale' && q.scaleLabels && (
          <div className="scale-legend"><span>{q.scaleLabels[0][locale]}</span><span>{q.scaleLabels[1][locale]}</span></div>
        )}
        {err}
      </fieldset>
    );
  }

  const common = {
    id, name: q.code, value: String(value ?? ''), 'aria-invalid': !!error, 'aria-describedby': error ? errId : undefined,
    placeholder: q.placeholder?.[locale], maxLength: q.maxLength,
  };
  return (
    <div className="q">
      <label className="q-label" htmlFor={id}>{label}</label>
      {help}
      {q.type === 'longtext' ? (
        <textarea className="textarea" {...common} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          className="input" {...common}
          type={q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : 'text'}
          inputMode={q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : undefined}
          autoComplete={q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : q.code === 'P1' ? 'name' : 'off'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {err}
    </div>
  );
}

function DraftField({ q, locale, value, error, onChange, onReset }: {
  q: Question; locale: Locale; value: string; error?: string; onChange: (v: string) => void; onReset: () => void;
}) {
  const d = t(locale).wiz;
  const words = wordCount(value);
  return (
    <div className="q">
      <label className="q-label" htmlFor={`q-${q.code}`}>{q.label[locale]}</label>
      <textarea id={`q-${q.code}`} className="textarea" style={{ minHeight: 280 }} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      <div className="counter">
        <span className={words >= 80 ? 'good' : ''}>{d.words(words)} · {d.wordsTarget}</span>
        <button type="button" className="link-btn" onClick={onReset}>{d.resetDraft}</button>
      </div>
      {error && <p className="err" role="alert">{d.errors[error]}</p>}
    </div>
  );
}

function ReviewGrid({ locale, title, abstract, checks, setChecks }: {
  locale: Locale; title: string; abstract: string; checks: Record<string, boolean>; setChecks: (c: Record<string, boolean>) => void;
}) {
  const d = t(locale).wiz.review;
  const auto = autoChecks(title, abstract);
  const msg = (c: (typeof auto)[number]) =>
    c.code === 'title' ? d.title(c.words ?? 0) : c.code === 'length' ? d.length(c.words ?? 0) : c.code === 'audience' ? d.audience(c.keyword) : d.benefit(c.keyword);
  return (
    <div className="stack">
      <div>
        <p className="label-s" style={{ marginBottom: 10 }}>{d.auto}</p>
        <ul className="checklist">
          {auto.map((c) => (
            <li key={c.code}>
              <span className={`pill ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? d.ok : d.toFix}</span>
              <div><strong>{d.names[c.code]}</strong><div className="small">{msg(c)}</div></div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label-s" style={{ marginBottom: 10 }}>{d.self}</p>
        <ul className="checklist">
          {SELF_CHECKS.map((s) => (
            <li key={s.code}>
              <input type="checkbox" id={`chk-${s.code}`} checked={!!checks[s.code]} onChange={(e) => setChecks({ ...checks, [s.code]: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--amber)', marginTop: 2 }} />
              <label htmlFor={`chk-${s.code}`}><strong>{s.label[locale]}</strong><div className="small">{s.rule[locale]}</div></label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
