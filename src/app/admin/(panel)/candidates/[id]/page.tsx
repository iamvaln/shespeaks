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
import { fmtDate } from '@/lib/i18n';
import { BRANCH_LABEL } from '@/lib/diagnostic';
import { wordCount } from '@/lib/text';
import {
  addNoteAction, assignCoachAction, changeStatusAction, deleteCandidateAction, remindNowAction, saveSubjectAction, selectPhotoAction,
  setNextPointAction, trackAction,
} from '../../../actions';

export const dynamic = 'force-dynamic';

const TRACK_STATE: Record<string, string> = { generee: 'Générée', retenue_coach: 'Retenue par la coach', ecartee: 'Écartée', choisie: 'Choisie' };
const ORIGIN: Record<string, string> = { personnelle: 'Réponse personnelle', croisement: 'Croisement domaine × angle', coach: 'Ajoutée par la coach' };

export const metadata = { title: 'Fiche candidate' };
export default async function Fiche({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireCoach();
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

  const fmtVal = (q: Question, v: Answer | undefined): string => {
    if (v === undefined || v === '') return '—';
    if (q.type === 'single') return labelOf(resolveOptions(q, refs), String(v), 'fr');
    if (q.type === 'multi') return (v as string[]).map((x) => labelOf(resolveOptions(q, refs), x, 'fr')).join(' · ');
    if (q.type === 'scale') return `${v} / 5`;
    return String(v);
  };
  const question = (sid: 'profile' | 'diag2', code: string) => SCREENS[sid].questions.find((q) => q.code === code)!;
  const screens = flowFor(c.branch).filter((s) => SCREENS[s].kind === 'form' || SCREENS[s].kind === 'draft');

  return (
    <>
      <p className="small"><Link href="/admin/candidates">← Candidates</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 24px' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{c.name}</h1>
          <div className="row" style={{ gap: 12 }}>
            <span className={`status s-${c.status}`}>{statusLabel(c.status)}</span>
            <span className="small">{evLabel} · départ {c.branch ?? '—'} · {c.locale === 'en' ? 'interface en anglais' : 'interface en français'}</span>
          </div>
        </div>
      </div>
      {sp.msg && <div className="flash" role="status">{sp.msg}</div>}
      {sp.err && <div className="flash err" role="alert">{sp.err}</div>}

      <div className="admin-cols">
        <div className="stack">
          <section className="card">
            <h2>Identité et contact</h2>
            <dl className="kv">
              <dt>WhatsApp</dt><dd>{wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a> : '—'}</dd>
              <dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Événement</dt><dd>{evLabel}</dd>
              <dt>Rôle</dt><dd>{c.role}</dd>
              <dt>Ancienneté tech</dt><dd>{fmtVal(question('profile', 'P7'), a['P7'])}</dd>
              <dt>Langue du talk</dt><dd>{fmtVal(question('diag2', 'P5'), a['P5'])}</dd>
              <dt>Inscrite le</dt><dd>{fmtDate(c.created_at, 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</dd>
              <dt>Formulaire terminé</dt><dd>{c.completed_at ? fmtDate(c.completed_at, 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : <>Non — écran « {SCREENS[resumeScreen(c.branch, c.current_screen)]?.title.fr ?? c.current_screen} », {c.reminders_sent} relance(s) auto</>}</dd>
            </dl>
            {!c.completed_at && c.email && (
              <form action={remindNowAction} style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={id} />
                <button className="btn btn-sm btn-ghost">Envoyer un rappel par email maintenant</button>
              </form>
            )}
          </section>

          <section className="card">
            <h2>Sujet retenu et candidature</h2>
            <form action={saveSubjectAction} className="stack">
              <input type="hidden" name="id" value={id} />
              <div className="q" style={{ marginBottom: 0 }}><label className="q-label" htmlFor="s-title">Titre</label><input id="s-title" className="input" name="title" defaultValue={subject?.title ?? ''} /></div>
              <div className="q" style={{ marginBottom: 0 }}>
                <label className="q-label" htmlFor="s-abs">Résumé</label>
                <textarea id="s-abs" className="textarea" name="abstract" style={{ minHeight: 180 }} defaultValue={subject?.abstract ?? ''} />
                <p className="small">{wordCount(subject?.abstract ?? '')} mots (cible 80 à 200)</p>
              </div>
              <div className="grid grid-3">
                <label className="small">Niveau du public<select className="select" name="audience" defaultValue={subject?.audience ?? ''}><option value="">—</option>{AUDIENCES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                <label className="small">Format<select className="select" name="format" defaultValue={subject?.format ?? ''}><option value="">—</option>{FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                <label className="small">État de la candidature<select className="select" name="application_state" defaultValue={subject?.application_state ?? 'a_soumettre'}>{APPLICATION_STATES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
              </div>
              <div><button className="btn">Enregistrer le sujet</button></div>
            </form>
          </section>

          {(c.branch === 'A' || c.branch === 'B') && (
            <section className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>Revue des pistes de sujets</h2>
                <form action={trackAction}><input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="regenerate" /><button className="btn btn-sm btn-ghost">Régénérer</button></form>
              </div>
              <p className="small" style={{ margin: '8px 0 16px' }}>
                Relis chaque piste, ajuste le titre, écarte ou ajoute la tienne. « Choisir » fait de la piste le sujet de la candidate.
                {showTracks === 'true' ? ' Les pistes non écartées sont visibles par la candidate.' : ' Les pistes ne sont pas visibles par la candidate (réglage).'}
              </p>
              <div className="stack-sm">
                {tracks.length === 0 && <p className="muted">Aucune piste.</p>}
                {tracks.map((t) => (
                  <div key={t.id} className={`track${t.state === 'choisie' ? ' chosen' : ''}${t.state === 'ecartee' ? ' discarded' : ''}`}>
                    <div className="tag">{TRACK_STATE[t.state]} · {ORIGIN[t.origin] ?? t.origin}{t.domain ? ` · ${t.domain}` : ''}{t.angle ? ` · ${labelOf(refs.angles, t.angle, 'fr')}` : ''}</div>
                    <form action={trackAction} className="inline">
                      <input type="hidden" name="cid" value={id} /><input type="hidden" name="track_id" value={t.id} />
                      <input className="input" name="title" defaultValue={t.title} aria-label="Titre de la piste" style={{ flex: 1, minWidth: 220 }} />
                      <select className="select" name="format" defaultValue={t.format ?? 'talk'} aria-label="Format" style={{ width: 'auto' }}>
                        <option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option>
                      </select>
                      <button name="op" value="save" className="btn btn-sm btn-ghost">Enregistrer</button>
                      {t.state !== 'choisie' && <button name="op" value="choose" className="btn btn-sm">Choisir</button>}
                      {t.state === 'generee' && <button name="op" value="shortlist" className="btn btn-sm btn-ghost">Retenir</button>}
                      {t.state === 'ecartee' ? <button name="op" value="restore" className="btn btn-sm btn-ghost">Rétablir</button> : t.state !== 'choisie' && <button name="op" value="discard" className="btn btn-sm btn-ghost">Écarter</button>}
                      {t.origin === 'coach' && <button name="op" value="delete" className="btn btn-sm btn-danger">Supprimer</button>}
                    </form>
                    {t.hook && <div className="small">{t.hook}</div>}
                  </div>
                ))}
              </div>
              <form action={trackAction} className="row" style={{ marginTop: 16, gap: 8 }}>
                <input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="add" />
                <input className="input" name="title" placeholder="Ajouter ma piste…" aria-label="Nouvelle piste" style={{ flex: 1, minWidth: 220 }} />
                <select className="select" name="format" aria-label="Format" style={{ width: 'auto' }}><option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option></select>
                <button className="btn btn-sm">Ajouter</button>
              </form>
            </section>
          )}

          {c.branch === 'D' && (
            <section className="card">
              <h2>Grille de relecture</h2>
              {review.length === 0 ? <p className="muted">Pas de grille.</p> : (
                <div className="table-wrap"><table className="t"><tbody>
                  {['title', 'length', 'audience', 'benefit', ...SELF_CHECKS.map((s) => s.code)].map((k) => {
                    const r = review.find((x) => x.criterion === k);
                    if (!r) return null;
                    const names: Record<string, string> = { title: 'Titre clair et court (≤ 12 mots)', length: 'Résumé de bonne longueur (80–200 mots)', audience: 'Public visé explicite', benefit: 'Bénéfice explicite' };
                    const self = SELF_CHECKS.find((s) => s.code === k);
                    const good = r.result === 'ok' || r.result === 'coche';
                    return (
                      <tr key={k}><td>{names[k] ?? self?.label.fr}</td>
                        <td><span className={`pill ${good ? 'ok' : 'bad'}`}>{r.result === 'ok' ? 'OK' : r.result === 'a_revoir' ? 'À revoir' : r.result === 'coche' ? 'Coché' : 'Non coché'}</span></td>
                        <td className="small">{k === 'title' || k === 'length' ? `${r.value} mots` : r.value ? `mot-clé : ${r.value}` : ''}</td></tr>
                    );
                  })}
                </tbody></table></div>
              )}
            </section>
          )}

          <section className="card">
            <h2>Réponses au formulaire</h2>
            <div className="stack">
              {screens.map((sid) => {
                const s = SCREENS[sid];
                const qs = visibleQuestions(s, a);
                return (
                  <div key={sid}>
                    <p className="label-s" style={{ marginBottom: 8 }}>{s.block.fr}</p>
                    <dl className="qa">{qs.map((q) => (<div key={q.code} style={{ display: 'contents' }}><dt>{q.code} · {q.label.fr}</dt><dd>{fmtVal(q, a[q.code])}</dd></div>))}</dl>
                  </div>
                );
              })}
            </div>
          </section>

          {rm && (
            <section>
              <h2>Plan de route tel que la candidate le voit</h2>
              <div lang={c.locale}><RoadmapView rm={rm} locale={c.locale} photoUrl={selPhoto ? `/api/photos/${selPhoto.id}` : photos[0] ? `/api/photos/${photos[0].id}` : null} internalDeadline={null} /></div>
            </section>
          )}
        </div>

        <aside className="stack">
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Suivi</h2>
            <form action={changeStatusAction} className="stack-sm">
              <input type="hidden" name="id" value={id} />
              <label className="small" htmlFor="status">Statut</label>
              <select id="status" name="status" className="select" defaultValue={c.status}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              <button className="btn btn-sm">Changer le statut</button>
            </form>
            <form action={assignCoachAction} className="stack-sm">
              <input type="hidden" name="id" value={id} />
              <label className="small" htmlFor="coach">Coach assignée {coach && !coach.active ? '(accès désactivé)' : ''}</label>
              <select id="coach" name="coach_id" className="select" defaultValue={c.coach_id ?? ''}><option value="">— aucune —</option>{coaches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn btn-sm btn-ghost">Assigner</button>
            </form>
            <form action={setNextPointAction} className="stack-sm">
              <input type="hidden" name="id" value={id} />
              <label className="small" htmlFor="npd">Prochain point</label>
              <input id="npd" type="date" name="next_point_date" className="input" defaultValue={c.next_point_date ?? ''} />
              <button className="btn btn-sm btn-ghost">Enregistrer la date</button>
            </form>
          </section>

          <section className="card stack">
            <h2 style={{ margin: 0 }}>Notes de suivi</h2>
            <form action={addNoteAction} className="stack-sm">
              <input type="hidden" name="id" value={id} />
              <textarea className="textarea" name="text" style={{ minHeight: 90 }} placeholder="Ce qui s’est dit, ce qui reste à faire…" aria-label="Nouvelle note" />
              <label className="small">Prochain point (facultatif)<input type="date" name="next_point_date" className="input" /></label>
              <button className="btn btn-sm">Ajouter la note</button>
            </form>
            <div className="stack-sm">
              {notes.map((n, i) => (
                <div className="note" key={i}>
                  <div className="small">{n.coach ?? '—'} · {fmtDate(n.at, 'fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{n.next_point_date ? ` · point le ${fmtDate(n.next_point_date, 'fr', { day: 'numeric', month: 'short' })}` : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card stack">
            <h2 style={{ margin: 0 }}>Photos de speaker</h2>
            {photos.length === 0 ? <p className="muted">Aucune photo déposée{c.completed_at ? ' (à demander à la candidate)' : ''}.</p> : (
              <>
                <p className="small">Consentement à l’usage : <strong>{c.consent_photo ? 'oui' : 'non'}</strong></p>
                <div className="photo-admin">
                  {photos.map((p) => (
                    <figure key={p.id} className={p.id === c.selected_photo_id ? 'sel' : ''}>
                      <a href={`/api/photos/${p.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/photos/${p.id}`} alt={`Photo ${p.id}`} /></a>
                      <figcaption className="small">{p.width && p.height ? `${p.width}×${p.height}` : ''} · {(p.size / 1024 / 1024).toFixed(1)} Mo</figcaption>
                      <form action={selectPhotoAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="photo_id" value={p.id === c.selected_photo_id ? 0 : p.id} />
                        <button className={`btn btn-sm${p.id === c.selected_photo_id ? '' : ' btn-ghost'}`}>{p.id === c.selected_photo_id ? '✓ Retenue' : 'Retenir'}</button></form>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <h2>Historique des statuts</h2>
            <ul className="hist">{history.map((h, i) => (
              <li key={i}>{h.old_status ? `${statusLabel(h.old_status)} → ` : ''}<strong>{statusLabel(h.new_status)}</strong><div className="small">{h.author} · {fmtDate(h.at, 'fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></li>
            ))}{history.length === 0 && <li className="muted">Aucun changement.</li>}</ul>
          </section>

          <details className="card">
            <summary>Zone sensible</summary>
            <form action={deleteCandidateAction} className="stack-sm" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={id} />
              <p className="small">Supprime définitivement la fiche, les réponses et les photos. Tape SUPPRIMER pour confirmer.</p>
              <input className="input" name="confirm" aria-label="Confirmation" />
              <button className="btn btn-sm btn-danger">Supprimer la candidate</button>
            </form>
          </details>
        </aside>
      </div>
      <p className="small" style={{ marginTop: 24 }}>Départ : {c.branch ? BRANCH_LABEL[c.branch] : '—'}</p>
    </>
  );
}
