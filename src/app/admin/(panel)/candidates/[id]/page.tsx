import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all } from '@/lib/db';
import { requireCoach } from '@/lib/auth';
import { STATUSES, getSetting, statusLabel } from '@/lib/db';
import {
  eventLabelFor, eventFor, getAnswers, getCandidate, getCoach, getPhotos, getRefs, getSubject, getTracks, listCoaches,
} from '@/lib/data';
import {
  APPLICATION_STATES, AUDIENCES, FORMATS, SCREENS, SELF_CHECKS, flowFor, labelOf, resolveOptions, resumeScreen, visibleQuestions, type Answer, type Question,
} from '@/lib/questions';
import { buildRoadmap } from '@/lib/roadmap';
import { RoadmapView } from '@/components/RoadmapView';
import { Icon } from '@/components/admin-icons';
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea';
import { PendingButton } from '@/components/PendingButton';
import { aiConfigured } from '@/lib/ai-topics';
import { CurrentIntoView } from '@/components/CurrentIntoView';
import { fmtDate } from '@/lib/i18n';
import { BRANCH_LABEL } from '@/lib/diagnostic';
import { screenProgress } from '@/lib/reminders';
import { BRANCH_SHORT, elapsed, one, topicSummary } from '@/lib/admin-format';
import { initials, wordCount } from '@/lib/text';
import {
  addNoteAction, deleteCandidateAction, followUpAction, remindNowAction, saveSubjectAction, selectPhotoAction, suggestTracksAction, trackAction,
} from '../../../actions';

export const metadata = { title: 'Fiche candidate' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // « Suggérer avec l’IA » waits for the model (the server action runs under this limit)

const TRACK_STATE: Record<string, string> = { generee: 'Générée', retenue_coach: 'Retenue par la coach', ecartee: 'Écartée', choisie: 'Choisie' };
const TRACK_TONE: Record<string, string> = { generee: 'neutral', retenue_coach: 'amber', ecartee: 'neutral', choisie: 'green' };
const ORIGIN: Record<string, string> = { personnelle: 'Réponse personnelle', croisement: 'Croisement domaine × angle', coach: 'Ajoutée par la coach', ia: 'Suggestion IA' };
/** The path of a candidate who goes all the way, in order. « En cours » and « Non retenue » sit outside it. */
const STAGES = ['diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'slides_validees', 'repetition_faite', 'jour_j'];
const DATE_TIME = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } as const;

export default async function Fiche({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; tab?: string }> }) {
  const me = await requireCoach();
  const { id: rawId } = await params;
  const sp = await searchParams;
  if (!/^[1-9]\d{0,8}$/.test(rawId)) notFound(); // hand-typed ids (abc, 1.5, 99999999999) are a 404, not a database error
  const id = Number(rawId);
  const c = await getCandidate(id);
  if (!c || !c.name) notFound();
  const [a, refs, subject, tracks, photos, allCoaches, ev, coach, showTracks] = await Promise.all([
    getAnswers(id), getRefs(), getSubject(id), getTracks(id), getPhotos(id), listCoaches(), eventFor(c), getCoach(c.coach_id),
    getSetting('show_tracks_to_candidates'),
  ]);
  const evLabel = await eventLabelFor(c, c.locale);
  const coaches = allCoaches.filter((x) => x.active || x.id === c.coach_id);
  const history = await all<{ old_status: string | null; new_status: string; author: string; at: string }>('SELECT * FROM status_history WHERE candidate_id=? ORDER BY id DESC', id);
  const notes = await all<{ text: string; at: string; next_point_date: string | null; coach: string | null }>(
    `SELECT n.text, n.at, n.next_point_date, co.name AS coach FROM notes n LEFT JOIN coaches co ON co.id=n.coach_id WHERE n.candidate_id=? ORDER BY n.id DESC`, id);
  const review = await all<{ criterion: string; result: string; value: string | null }>('SELECT * FROM review_items WHERE candidate_id=?', id);
  const rm = c.branch && c.completed_at ? buildRoadmap({ answers: a, branch: c.branch, locale: c.locale, subjectTitle: subject?.title, event: ev, eventName: evLabel }) : null;
  const selPhoto = photos.find((p) => p.id === c.selected_photo_id);
  const wa = (c.whatsapp ?? '').replace(/[^\d]/g, '');
  const now = new Date();

  const TABS: [string, string, number | null][] = [['sujet', 'Sujet et pistes', null], ['reponses', 'Réponses', null], ['notes', 'Notes et historique', notes.length || null], ['photos', 'Photos', photos.length || null], ...(rm ? [['plan', 'Plan de route', null] as [string, string, null]] : [])];
  const tab = TABS.some(([t]) => t === one(sp.tab)) ? one(sp.tab) : 'sujet';
  const tabHref = (t: string) => `/admin/candidates/${id}${t === 'sujet' ? '' : `?tab=${t}`}`;

  const fmtVal = (q: Question, v: Answer | undefined): string => {
    if (v === undefined || v === '') return '—';
    if (q.type === 'single') return labelOf(resolveOptions(q, refs), String(v), 'fr');
    if (q.type === 'multi') return (v as string[]).map((x) => labelOf(resolveOptions(q, refs), x, 'fr')).join(' · ');
    if (q.type === 'scale') return `${v} / 5`;
    return String(v);
  };
  const question = (sid: 'profile' | 'diag2', code: string) => SCREENS[sid].questions.find((q) => q.code === code)!;
  const screens = flowFor(c.branch).filter((s) => SCREENS[s].kind === 'form' || SCREENS[s].kind === 'draft');
  const progress = c.completed_at ? null : screenProgress(c);
  const stage = STAGES.indexOf(c.status);
  const stageLabel = (s: string) => statusLabel(s);

  const meta = [c.role, evLabel, c.branch ? BRANCH_SHORT[c.branch] : null, c.completed_at ? `intérêt reçu le ${fmtDate(c.completed_at, 'fr', DATE_TIME)}` : `parcours en cours, inscrite le ${fmtDate(c.created_at, 'fr', DATE_TIME)}`].filter(Boolean).join(' · ');

  return (
    <div className="a-page" style={{ gap: 20 }}>
      <Link href="/admin/candidates" className="a-back"><Icon name="chevron" size={16} style={{ transform: 'scaleX(-1)' }} />Candidates</Link>

      {sp.msg && <div className="flash" role="status" style={{ margin: 0 }}>{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert" style={{ margin: 0 }}>{sp.err}</div>}

      <header className="a-fiche-head">
        <div className="a-fiche-id">
          <span className="a-avatar-lg" aria-hidden="true">{initials(c.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="a-h1" style={{ margin: 0 }}>{c.name}</h1>
            <p className="a-muted" style={{ margin: '4px 0 0' }}>{meta}</p>
          </div>
        </div>
        <div className="a-actions">
          <a className="a-btn is-ghost a-jump" href="#suivi">Suivi ↓</a>
          {wa && <a className="a-btn is-amber" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Icon name="message" />Écrire sur WhatsApp</a>}
          {c.email && <a className="a-btn is-ghost" href={`mailto:${c.email}`}><Icon name="mail" />Envoyer un email</a>}
          {!c.completed_at && c.email && (
            <form action={remindNowAction}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="tab" value={tab === 'sujet' ? '' : tab} />
              <button className="a-btn is-ghost">Envoyer un rappel</button>
            </form>
          )}
        </div>
      </header>

      {/* where she is on the way */}
      {stage >= 0 && (
        <section className="a-card" aria-label="Étape du parcours">
          <ol className="a-steps">
            {STAGES.map((s, i) => (
              <li key={s} className={`a-step${i < stage ? ' is-done' : i === stage ? ' is-current' : ''}`} aria-current={i === stage ? 'step' : undefined}>
                <span className="dot">{i < stage ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>{stageLabel(s)}
              </li>
            ))}
          </ol>
          <div className="a-steps-sm">
            <div className="a-row-between"><strong>Étape {stage + 1} sur {STAGES.length} · {stageLabel(c.status)}</strong>{stage + 1 < STAGES.length && <span className="a-sub" style={{ whiteSpace: 'normal' }}>Ensuite : {stageLabel(STAGES[stage + 1])}</span>}</div>
            <div className="a-segs" aria-hidden="true">{STAGES.map((s, i) => <i key={s} className={i < stage ? 'is-done' : i === stage ? 'is-current' : undefined} />)}</div>
          </div>
        </section>
      )}
      {c.status === 'en_cours' && progress && (
        <section className="a-card a-stack" aria-label="Parcours en cours" style={{ gap: 10 }}>
          <div className="a-row-between"><strong>Parcours en cours · écran {progress.done} sur {progress.total}</strong><span className="a-pill is-soft">En cours</span></div>
          <div className="a-bar" role="img" aria-label={`Écran ${progress.done} sur ${progress.total}`}><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
          <span className="a-sub" style={{ whiteSpace: 'normal' }}>S’est arrêtée à « {progress.label} » · inactive depuis {elapsed(c.last_activity_at, now)} · {c.reminders_sent} relance{c.reminders_sent > 1 ? 's' : ''} automatique{c.reminders_sent > 1 ? 's' : ''}</span>
        </section>
      )}
      {c.status === 'en_cours' && !progress && (
        <section className="a-card" aria-label="Statut"><div className="a-row-between"><strong>Formulaire terminé · statut remis à « En cours »</strong><span className="a-pill is-soft">En cours</span></div></section>
      )}
      {c.status === 'non_retenue' && (
        <section className="a-card" aria-label="Statut"><div className="a-row-between"><strong>Candidature non retenue</strong><span className="a-pill is-red">Non retenue</span></div></section>
      )}

      <div className="a-split">
        <div className="a-main a-stack" style={{ gap: 20 }}>
          <CurrentIntoView className="a-tabbar" aria-label="Sections de la fiche">
            {TABS.map(([t, label, n]) => (
              <Link key={t} href={tabHref(t)} scroll={false} className="a-tabbar-link" aria-current={t === tab ? 'page' : undefined}>
                {label}{n ? <span>{n}</span> : null}
              </Link>
            ))}
          </CurrentIntoView>

          {tab === 'sujet' && (
            <>
              {c.branch && (
                <section className="a-card" aria-labelledby="h-repondu">
                  <h2 id="h-repondu" className="a-h2">Ce qu’elle a répondu</h2>
                  <p className="a-muted" style={{ margin: '2px 0 8px' }}>
                    Ses réponses utiles pour le sujet, à lire avant les pistes. Tout le formulaire : onglet <Link href={tabHref('reponses')}>Réponses</Link>.
                  </p>
                  <dl className="a-qa">{topicSummary(c.branch, a).map((q) => (<div key={q.code}><dt>{q.label.fr}</dt><dd style={{ whiteSpace: 'pre-line' }}>{fmtVal(q, a[q.code])}</dd></div>))}</dl>
                </section>
              )}
              {(c.branch === 'A' || c.branch === 'B') && (
                <section className="a-card is-flush" aria-labelledby="h-pistes">
                  <div className="a-card-head" style={{ flexWrap: 'wrap' }}>
                    <div>
                      <h2 id="h-pistes" className="a-h2">Pistes de sujet</h2>
                      <p className="a-muted" style={{ margin: '2px 0 0' }}>
                        Générées à partir de ses réponses. « Choisir » fait de la piste le sujet de la candidate. « Régénérer » refait les propositions-modèles
                        et « Suggérer avec l’IA » les suggestions de l’IA, sauf les pistes retenues, écartées ou choisies (« Retenir » garde une piste, même réécrite).
                        {!aiConfigured() ? ' Suggestions de l’IA non activées sur ce serveur (clé API manquante).' : !c.completed_at ? ' Les suggestions de l’IA seront possibles quand le formulaire sera terminé.' : ' Les suggestions de l’IA sont à relire : elles peuvent se tromper.'}
                        {showTracks === 'true' ? ' Les pistes non écartées sont visibles par la candidate (une suggestion de l’IA seulement une fois retenue ou choisie).' : ' Les pistes ne sont pas visibles par la candidate (réglage).'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {aiConfigured() && c.completed_at && (
                        <form action={suggestTracksAction}>
                          <input type="hidden" name="cid" value={id} />
                          <PendingButton className="a-btn is-sm" pendingLabel="L’IA réfléchit…" confirmText="Envoyer au fournisseur d’IA les réponses de cette candidate sur son sujet, son poste ou ses études, son ancienneté, le format souhaité et les titres déjà sur sa fiche pour obtenir des titres ? Son nom et ses coordonnées ne sont pas envoyés (les adresses et numéros écrits dans ses réponses sont masqués ; un nom écrit dans une phrase ne peut pas l’être). Les suggestions de l’IA non retenues sont remplacées.">
                            <Icon name="spark" size={16} />Suggérer avec l’IA
                          </PendingButton>
                        </form>
                      )}
                      <form action={trackAction}><input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="regenerate" /><button className="a-btn is-ghost is-sm"><Icon name="clock" size={16} />Régénérer</button></form>
                    </div>
                  </div>
                  {tracks.length === 0 ? <p className="a-empty">Aucune piste.</p> : (
                    <ul className="a-tracks">
                      {tracks.map((t, i) => (
                        <li key={t.id} className={`a-track${t.state === 'choisie' ? ' is-chosen' : ''}${t.state === 'retenue_coach' ? ' is-kept' : ''}${t.state === 'ecartee' ? ' is-out' : ''}`}>
                          <form action={trackAction} className="a-track-form">
                            <input type="hidden" name="cid" value={id} /><input type="hidden" name="track_id" value={t.id} />
                            <span className="a-num" aria-hidden="true">{i + 1}</span>
                            <div className="a-track-main">
                              <AutoGrowTextarea className="a-track-title" name="title" defaultValue={t.title} aria-label={`Titre de la piste ${i + 1}`} />
                              <span className="a-track-meta">
                                <span className={`a-pill is-${TRACK_TONE[t.state] ?? 'neutral'}`}>{TRACK_STATE[t.state] ?? t.state}</span>
                                <span>{ORIGIN[t.origin] ?? t.origin}{t.domain ? ` · ${t.domain}` : ''}{t.angle ? ` · ${labelOf(refs.angles, t.angle, 'fr')}` : ''}</span>
                                <select className="a-mini-select" name="format" defaultValue={t.format ?? 'talk'} aria-label={`Format de la piste ${i + 1}`}>
                                  <option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option>
                                </select>
                              </span>
                              {t.hook && <span className="a-sub" style={{ whiteSpace: 'normal' }}>{t.hook}</span>}
                            </div>
                            <div className="a-track-actions">
                              {t.state !== 'choisie' && <button name="op" value="choose" className="a-btn is-sm" aria-label={`Choisir la piste ${i + 1}`}>Choisir</button>}
                              {t.state === 'generee' && <button name="op" value="shortlist" className="a-btn is-ghost is-sm" aria-label={`Retenir la piste ${i + 1}`}>Retenir</button>}
                              {t.state === 'ecartee' ? <button name="op" value="restore" className="a-btn is-ghost is-sm" aria-label={`Rétablir la piste ${i + 1}`}>Rétablir</button> : t.state !== 'choisie' && <button name="op" value="discard" className="a-link-btn" aria-label={`Écarter la piste ${i + 1}`}>Écarter</button>}
                              <button name="op" value="save" className="a-link-btn" aria-label={`Enregistrer la piste ${i + 1}`}>Enregistrer</button>
                              {t.origin === 'coach' && <button name="op" value="delete" className="a-link-btn is-danger" aria-label={`Supprimer la piste ${i + 1}`}>Supprimer</button>}
                            </div>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={trackAction} className="a-add-track">
                    <input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="add" />
                    <input className="a-input" name="title" placeholder="Ajouter ma propre piste…" aria-label="Nouvelle piste" />
                    <select className="a-select-f" name="format" aria-label="Format de la nouvelle piste" style={{ width: 'auto' }}><option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option></select>
                    <button className="a-btn is-ghost">Ajouter</button>
                  </form>
                </section>
              )}

              <section className="a-card a-stack" aria-labelledby="h-sujet">
                <div><h2 id="h-sujet" className="a-h2">Sujet retenu et candidature</h2><p className="a-muted" style={{ margin: '2px 0 0' }}>Se remplit tout seul quand tu choisis une piste ; à compléter avant de valider le sujet.</p></div>
                <form action={saveSubjectAction} className="a-stack">
                  <input type="hidden" name="id" value={id} />
                  <label className="a-label">Titre<input className="a-input" name="title" defaultValue={subject?.title ?? ''} placeholder="Choisis une piste ou écris le titre" /></label>
                  <label className="a-label">Résumé
                    <textarea className="a-textarea" name="abstract" defaultValue={subject?.abstract ?? ''} placeholder="Ce que le public va comprendre, voir, repartir avec…" />
                    <span className="a-sub" style={{ fontWeight: 400 }}>{wordCount(subject?.abstract ?? '')} mots · cible : 80 à 200</span>
                  </label>
                  <div className="a-grid-3">
                    <label className="a-label">Niveau du public<select className="a-select-f" name="audience" defaultValue={subject?.audience ?? ''}><option value="">—</option>{AUDIENCES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                    <label className="a-label">Format<select className="a-select-f" name="format" defaultValue={subject?.format ?? ''}><option value="">—</option>{FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                    <label className="a-label">État de la candidature<select className="a-select-f" name="application_state" defaultValue={subject?.application_state ?? 'a_soumettre'}>{APPLICATION_STATES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                  </div>
                  <div><button className="a-btn">Enregistrer le sujet</button></div>
                </form>
              </section>

              {c.branch === 'D' && (
                <section className="a-card is-flush" aria-labelledby="h-grille">
                  <div className="a-card-head"><h2 id="h-grille" className="a-h2">Grille de relecture</h2></div>
                  {review.length === 0 ? <p className="a-empty">Pas de grille.</p> : (
                    <ul className="a-checks">
                      {['title', 'length', 'audience', 'benefit', ...SELF_CHECKS.map((s) => s.code)].map((k) => {
                        const r = review.find((x) => x.criterion === k);
                        if (!r) return null;
                        const names: Record<string, string> = { title: 'Titre clair et court (≤ 12 mots)', length: 'Résumé de bonne longueur (80–200 mots)', audience: 'Public visé explicite', benefit: 'Bénéfice explicite' };
                        const self = SELF_CHECKS.find((s) => s.code === k);
                        const good = r.result === 'ok' || r.result === 'coche';
                        return (
                          <li key={k}><span>{names[k] ?? self?.label.fr}</span>
                            <span className={`a-pill is-${good ? 'green' : 'red'}`}>{r.result === 'ok' ? 'OK' : r.result === 'a_revoir' ? 'À revoir' : r.result === 'coche' ? 'Coché' : 'Non coché'}</span>
                            <span className="a-sub">{k === 'title' || k === 'length' ? `${r.value} mots` : r.value ? `mot-clé : ${r.value}` : ''}</span></li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}

          {tab === 'reponses' && (
            <section className="a-card" aria-label="Réponses au formulaire">
              {screens.map((sid) => {
                const s = SCREENS[sid];
                return (
                  <div key={sid} className="a-qa-group">
                    <h2 className="a-eyebrow" style={{ color: 'var(--amber-text)' }}>{s.title.fr}</h2>
                    <dl className="a-qa">{visibleQuestions(s, a).map((q) => (<div key={q.code}><dt>{q.label.fr}</dt><dd>{fmtVal(q, a[q.code])}</dd></div>))}</dl>
                  </div>
                );
              })}
              {!c.completed_at && <p className="a-muted" style={{ margin: 0 }}>Formulaire non terminé : seules les réponses déjà enregistrées sont affichées.</p>}
            </section>
          )}

          {tab === 'notes' && (
            <>
              <section className="a-card a-stack" aria-labelledby="h-notes">
                <h2 id="h-notes" className="a-h2">Notes de suivi</h2>
                <form action={addNoteAction} className="a-stack" style={{ gap: 12 }}>
                  <input type="hidden" name="id" value={id} />
                  <textarea className="a-textarea" name="text" style={{ minHeight: 90 }} placeholder="Ce qui s’est dit, ce qui reste à faire…" aria-label="Nouvelle note" />
                  <div className="a-actions">
                    <label className="a-inline-label">Prochain point (facultatif)<input type="date" name="next_point_date" className="a-input" style={{ width: 'auto' }} /></label>
                    <button className="a-btn">Ajouter la note</button>
                  </div>
                </form>
                {notes.length === 0 ? <p className="a-muted" style={{ margin: 0 }}>Pas encore de note.</p> : (
                  <ul className="a-notes">
                    {notes.map((n, i) => (
                      <li key={i}>
                        <div className="a-sub" style={{ whiteSpace: 'normal' }}>{n.coach ?? '—'} · {fmtDate(n.at, 'fr', DATE_TIME)}{n.next_point_date ? ` · point le ${fmtDate(n.next_point_date, 'fr', { day: 'numeric', month: 'long' })}` : ''}</div>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.text}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="a-card a-stack" aria-labelledby="h-hist">
                <h2 id="h-hist" className="a-h2">Historique des statuts</h2>
                {history.length === 0 ? <p className="a-muted" style={{ margin: 0 }}>Aucun changement.</p> : (
                  <ul className="a-hist">
                    {history.map((h, i) => (
                      <li key={i}><span>{h.old_status ? `${statusLabel(h.old_status)} → ` : ''}<strong>{statusLabel(h.new_status)}</strong></span><span className="a-sub" style={{ whiteSpace: 'normal' }}>{h.author} · {fmtDate(h.at, 'fr', DATE_TIME)}</span></li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {tab === 'photos' && (
            <section className="a-card a-stack" aria-labelledby="h-photos">
              <h2 id="h-photos" className="a-h2">Photos de speaker</h2>
              {photos.length === 0 ? (
                <div className="a-emptybox">
                  <span className="a-emptyicon" aria-hidden="true"><Icon name="users" size={26} /></span>
                  <strong>Aucune photo déposée</strong>
                  <p className="a-muted" style={{ margin: 0, maxWidth: '46ch' }}>Elle peut en ajouter une depuis son plan de route. La photo sert au visuel de speaker quand sa candidature est retenue.{c.completed_at ? '' : ' Son formulaire n’est pas encore terminé.'}</p>
                  {wa && <a className="a-btn is-ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">Lui demander sur WhatsApp</a>}
                </div>
              ) : (
                <>
                  <p className="a-muted" style={{ margin: 0 }}>Consentement à l’usage : <strong style={{ color: 'var(--ink)' }}>{c.consent_photo ? 'oui' : 'non'}</strong></p>
                  <div className="photo-admin">
                    {photos.map((p) => (
                      <figure key={p.id} className={p.id === c.selected_photo_id ? 'sel' : ''}>
                        <a href={`/api/photos/${p.id}`} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/photos/${p.id}`} alt={`Photo ${p.id}`} /></a>
                        <figcaption className="a-sub">{p.width && p.height ? `${p.width}×${p.height}` : ''} · {Math.max(1, Math.round(p.size / 1024))} Ko</figcaption>
                        <form action={selectPhotoAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="photo_id" value={p.id === c.selected_photo_id ? 0 : p.id} />
                          <button className={`a-btn is-sm${p.id === c.selected_photo_id ? '' : ' is-ghost'}`}>{p.id === c.selected_photo_id ? '✓ Retenue' : 'Retenir'}</button></form>
                      </figure>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'plan' && rm && (
            <section aria-label="Plan de route">
              <p className="a-muted" style={{ margin: '0 0 12px' }}>Le plan de route tel que la candidate le voit.</p>
              <RoadmapView rm={rm} locale={c.locale} photoUrl={selPhoto ? `/api/photos/${selPhoto.id}` : photos[0] ? `/api/photos/${photos[0].id}` : null} internalDeadline={null} />
            </section>
          )}
        </div>

        <aside className="a-side">
          <section className="a-card a-stack" aria-labelledby="h-contact" style={{ gap: 12 }}>
            <h2 id="h-contact" className="a-h2">Contact</h2>
            <dl className="a-dl">
              <dt>WhatsApp</dt><dd>{wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a> : '—'}</dd>
              <dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Rôle</dt><dd>{c.role || '—'}</dd>
              <dt>Ancienneté</dt><dd>{fmtVal(question('profile', 'P7'), a['P7'])}</dd>
              <dt>Langue du talk</dt><dd>{fmtVal(question('diag2', 'P5'), a['P5'])}</dd>
              <dt>Interface</dt><dd>{c.locale === 'en' ? 'En anglais' : 'En français'}</dd>
              <dt>Inscrite le</dt><dd>{fmtDate(c.created_at, 'fr', DATE_TIME)}</dd>
              <dt>Formulaire</dt><dd>{c.completed_at ? `Terminé le ${fmtDate(c.completed_at, 'fr', DATE_TIME)}` : `Pas terminé : écran « ${SCREENS[resumeScreen(c.branch, c.current_screen)]?.title.fr ?? c.current_screen} »`}</dd>
            </dl>
          </section>

          <section className="a-card" id="suivi" aria-labelledby="h-suivi">
            <form action={followUpAction} className="a-stack">
              <h2 id="h-suivi" className="a-h2">Suivi</h2>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="tab" value={tab === 'sujet' ? '' : tab} />
              {/* what the page showed: only a field she changes is saved, so a page left open never overwrites what a colleague did meanwhile */}
              <input type="hidden" name="was_status" value={c.status} /><input type="hidden" name="was_coach" value={c.coach_id ?? ''} /><input type="hidden" name="was_date" value={c.next_point_date ?? ''} />
              <label className="a-label">Statut<select className="a-select-f" name="status" defaultValue={c.status}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="a-label">Coach assignée {coach && !coach.active ? '(accès désactivé)' : ''}<select className="a-select-f" name="coach_id" defaultValue={c.coach_id ?? ''}><option value="">— aucune —</option>{coaches.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === me.id ? ' (toi)' : ''}</option>)}</select></label>
              <label className="a-label">Prochain point<input className="a-input" type="date" name="next_point_date" defaultValue={c.next_point_date ?? ''} /></label>
              <button className="a-btn">Enregistrer le suivi</button>
            </form>
          </section>

          <details className="a-card a-danger-zone">
            <summary>Supprimer la candidate</summary>
            <form action={deleteCandidateAction} className="a-stack" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={id} />
              <p className="a-muted" style={{ margin: 0 }}>Supprime définitivement la fiche, les réponses et les photos. Tape SUPPRIMER pour confirmer.</p>
              <input className="a-input" name="confirm" aria-label="Confirmation" autoComplete="off" />
              <button className="a-btn is-danger">Supprimer la candidate</button>
            </form>
          </details>
          <p className="a-sub" style={{ margin: 0 }}>Point de départ : {c.branch ? BRANCH_LABEL[c.branch] : '—'}</p>
        </aside>
      </div>
    </div>
  );
}
