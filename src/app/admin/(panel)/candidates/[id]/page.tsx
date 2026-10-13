import Link from 'next/link';
import { notFound } from 'next/navigation';
import { all } from '@/lib/db';
import { requireCoach } from '@/lib/auth';
import { STATUSES, statusLabel } from '@/lib/db';
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
import { InlineForm } from '@/components/InlineForm';
import { FoldAll } from '@/components/FoldAll';
import { Fold } from '@/components/Fold';
import { OpenOnHash } from '@/components/OpenOnHash';
import { EditButton, EditCancel, EditScope } from '@/components/EditScope';
import { aiConfigured, openaiConfigured } from '@/lib/ai-topics';
import { CurrentIntoView } from '@/components/CurrentIntoView';
import { fmtDate } from '@/lib/i18n';
import { BRANCH_LABEL } from '@/lib/diagnostic';
import { screenProgress } from '@/lib/reminders';
import { BRANCH_SHORT, elapsed, one, topicSummary } from '@/lib/admin-format';
import { currentSubject } from '@/lib/ai-subject';
import { getSubjectProposal } from '@/lib/ai-subject-store';
import { UseInField } from '@/components/UseInField';
import { initials, wordCount } from '@/lib/text';
import { appUrl } from '@/lib/mail';
import { CHOOSE_AFTER_HER, journeyOf, listProposals, lockOf, LOCK_MESSAGE, needsChoice, NEEDS_CHOICE } from '@/lib/proposals';
import { ideaLines, journeyState, WAITING_SR, type ChoicePayload, type PhotoPayload, type Proposal, type SubjectPayload } from '@/lib/journey';
import {
  addNoteAction, deleteCandidateAction, followUpAction, improveSubjectAction, markHandledAction, remindNowAction, reopenExchangesAction, requestPhotoAction, saveSubjectAction, selectPhotoAction,
  sendChoiceAction, sendSubjectAction, suggestTracksAction, trackAction, validatePhotoAction,
} from '../../../actions';

export const metadata = { title: 'Fiche candidate' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // « Suggérer avec l’IA » waits for the model (the server action runs under this limit)

const TRACK_STATE: Record<string, string> = { generee: 'Générée', retenue_coach: 'Retenue par la coach', ecartee: 'Écartée', choisie: 'Choisie' };
const TRACK_TONE: Record<string, string> = { generee: 'neutral', retenue_coach: 'amber', ecartee: 'neutral', choisie: 'green' };
const ORIGIN: Record<string, string> = { personnelle: 'Réponse personnelle', croisement: 'Croisement domaine × angle', coach: 'Ajoutée par la coach', ia: 'Suggestion IA' };
/** The path of a candidate who goes all the way, in order. « En cours » and « Non retenue » sit outside it. */
const STAGES = ['diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'slides_validees', 'repetition_faite', 'jour_j'];
const WAITING_LABEL: Record<string, string> = { coach: 'À toi', candidate: 'En attente de la candidate', none: 'Terminé' };
const KIND_LABEL: Record<string, string> = { choix: 'Choix de sujet', sujet: 'Sujet à valider', photo: 'Demande de photo' };
const RESPONSE_LABEL: Record<string, string> = { choisie: 'A choisi un sujet', aucune: 'Aucun ne lui convient', approuvee: 'A approuvé le sujet', changements: 'Demande des changements', photo_deposee: 'A déposé une photo' };
/** What the coach sent, in a few words. */
const sentSummary = (x: Proposal): string => {
  if (x.kind === 'choix') return (x.payload as ChoicePayload).items.map((i) => i.title).join(' · ');
  if (x.kind === 'sujet') return (x.payload as SubjectPayload).title;
  return (x.payload as PhotoPayload).comment;
};
const DATE_TIME = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } as const;

export default async function Fiche({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; tab?: string }> }) {
  const me = await requireCoach();
  const { id: rawId } = await params;
  const sp = await searchParams;
  if (!/^[1-9]\d{0,8}$/.test(rawId)) notFound(); // hand-typed ids (abc, 1.5, 99999999999) are a 404, not a database error
  const id = Number(rawId);
  const c = await getCandidate(id);
  if (!c || !c.name) notFound();
  const [a, refs, subject, tracks, photos, allCoaches, ev, coach, journeyNow, exchanges] = await Promise.all([
    getAnswers(id), getRefs(), getSubject(id), getTracks(id), getPhotos(id), listCoaches(), eventFor(c), getCoach(c.coach_id),
    journeyOf(id), listProposals(id),
  ]);
  const retained = tracks.filter((t) => t.state === 'retenue_coach');
  // the button needs 2 or 3 retained tracks, each with a SAVED sentence (the hook shown as a starting point is not sent)
  const choiceReady = retained.length >= 2 && retained.length <= 3 && retained.every((t) => (t.pitch ?? '').trim());
  // once she counts as submitted (her confirmation, « déjà soumise » in the form, or a status moved forward) nothing more is sent
  const submitted = journeyNow?.step === 'soumise';
  const SUBMITTED_NOTE = 'La candidature est déjà soumise : plus rien n’est envoyé à la candidate.';
  // while a proposal waits for her answer, after she approved her subject, or once submitted: tracks, subject, AI and deletions are locked
  const lock = lockOf(c, subject?.application_state, exchanges);
  const choiceHint = retained.length > 3 ? `${retained.length} pistes retenues : il en faut 3 au plus. Écarte celles qui ne partiront pas.`
    : retained.length < 2 ? `${retained.length === 0 ? 'Aucune piste retenue' : '1 piste retenue'} : retiens-en 2 ou 3 (bouton « Retenir »).`
    : retained.some((t) => !(t.pitch ?? '').trim()) ? 'Chaque piste retenue doit avoir sa phrase pour la candidate, enregistrée (bouton « Enregistrer » de la piste).'
    : `${retained.length} pistes retenues, chacune avec sa phrase : prêt à envoyer.`;
  // her form is not finished: the tracks come from her answers, so nothing is generated or added before she sends it (the AI buttons wait too)
  const FORM_UNFINISHED = 'Possible quand son formulaire sera terminé : les pistes partent de ses réponses.';
  // what she imagined when she chose her track: the coach builds the plan from it (latest choice only)
  const chosenWithIdeas = [...exchanges].reverse().find((x) => x.kind === 'choix' && x.response === 'choisie');
  const herIdeas = chosenWithIdeas?.response_data
    ? { title: (chosenWithIdeas.payload as ChoicePayload).items[chosenWithIdeas.response_choice ?? -1]?.title ?? '', ideas: chosenWithIdeas.response_data }
    : null;
  const subjectReady = !!subject?.title?.trim() && !!subject?.abstract?.trim();
  const waitsForChoice = needsChoice(c.branch, exchanges); // A and B: « Choisir » and the send of the subject are greyed until she has chosen one of the tracks sent
  const jstate = journeyNow ? journeyState(journeyNow, exchanges, photos.length) : null; // the same wording as the list
  const toHandle = exchanges.some((x) => x.state === 'repondue' && !x.handled_at);
  const exchangesNewestFirst = [...exchanges].reverse();
  const evLabel = await eventLabelFor(c, c.locale);
  const startSubject = c.branch ? currentSubject(c.branch, a, subject ?? null) : null;
  const proposal = await getSubjectProposal(id);
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
          {wa && <a className="a-btn is-ghost" href={`https://wa.me/${wa}?text=${encodeURIComponent(`${c.locale === 'en' ? `Hello ${c.name?.split(' ')[0] ?? ''}, here is your personal link to get back to your SheSpeaks space: ` : `Bonjour ${c.name?.split(' ')[0] ?? ''}, voici ton lien personnel pour retrouver ton espace SheSpeaks : `}${appUrl()}/reprendre/${c.token}`)}`} target="_blank" rel="noopener noreferrer">Envoyer son lien d’accès sur WhatsApp</a>}
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
        <Fold id="h-parcours" title={`Parcours : étape ${stage + 1} sur ${STAGES.length}`} bodyClassName="">
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
        </Fold>
      )}
      {c.status === 'en_cours' && progress && (
        <Fold id="h-parcours-ec" title={`Parcours en cours · écran ${progress.done} sur ${progress.total}`} aside={<span className="a-pill is-soft">En cours</span>} bodyClassName="a-stack">
          <div className="a-bar" role="img" aria-label={`Écran ${progress.done} sur ${progress.total}`}><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
          <span className="a-sub" style={{ whiteSpace: 'normal' }}>S’est arrêtée à « {progress.label} » · inactive depuis {elapsed(c.last_activity_at, now)} · {c.reminders_sent} relance{c.reminders_sent > 1 ? 's' : ''} automatique{c.reminders_sent > 1 ? 's' : ''}</span>
        </Fold>
      )}
      {c.status === 'en_cours' && !progress && (
        <section className="a-card" aria-label="Statut"><div className="a-row-between"><strong>Formulaire terminé · statut remis à « En cours »</strong><span className="a-pill is-soft">En cours</span></div></section>
      )}
      {c.status === 'non_retenue' && (
        <section className="a-card" aria-label="Statut"><div className="a-row-between"><strong>Candidature non retenue</strong><span className="a-pill is-red">Non retenue</span></div></section>
      )}

      <OpenOnHash />
      <div className="a-split">
        <div className="a-main a-stack" style={{ gap: 20 }}>
          <CurrentIntoView className="a-tabbar" aria-label="Sections de la fiche">
            {TABS.map(([t, label, n]) => (
              <Link key={t} href={tabHref(t)} scroll={false} className="a-tabbar-link" aria-current={t === tab ? 'page' : undefined}>
                {label}{n ? <span>{n}</span> : null}
              </Link>
            ))}
          </CurrentIntoView>
          <div className="a-fold-page"><FoldAll selector="details.a-fold" what="Blocs de la page" /></div>

          {tab === 'sujet' && (
            <>
              <Fold id="h-echanges" title="Échanges avec la candidate" aside={journeyNow && <span className={`a-pill is-${journeyNow.waiting === 'coach' ? 'amber' : journeyNow.waiting === 'none' ? 'green' : 'soft'}`}>{WAITING_LABEL[journeyNow.waiting]}</span>}>
                {jstate && <p style={{ margin: 0 }}><strong>État : {jstate.label}</strong><span className="sr-only"> ({WAITING_SR[jstate.waiting]})</span></p>}
                {lock && <div className="a-lock-note" role="note">{LOCK_MESSAGE[lock]}</div>}
                {(lock === 'approuve' || lock === 'soumise') && (
                  <InlineForm action={reopenExchangesAction} className="a-actions">
                    <input type="hidden" name="cid" value={id} />
                    <span className="a-muted">Besoin de modifier son sujet ou de lui envoyer autre chose ?</span>
                    <PendingButton className="a-btn is-ghost is-sm" pendingLabel="…" confirmText="Rouvrir les échanges ? Pistes et sujet redeviennent modifiables et tu pourras de nouveau lui envoyer des propositions. Si elle avait confirmé sa soumission, elle la confirmera à nouveau à la fin. Son statut ne change pas.">Rouvrir les échanges</PendingButton>
                  </InlineForm>
                )}
                {toHandle && (
                  <InlineForm action={markHandledAction} className="a-actions">
                    <input type="hidden" name="cid" value={id} />
                    <span className="a-muted">Elle a répondu : cette réponse compte dans « à traiter ».</span>
                    <button className="a-btn is-sm">Marquer comme traité</button>
                  </InlineForm>
                )}
                {exchangesNewestFirst.length === 0 ? <p className="a-muted" style={{ margin: 0 }}>Rien n’a encore été envoyé à la candidate.</p> : (
                  <ul className="a-notes">
                    {exchangesNewestFirst.map((x) => (
                      <li key={x.id}>
                        <div className="a-sub" style={{ whiteSpace: 'normal' }}>{fmtDate(x.sent_at, 'fr', DATE_TIME)} · {KIND_LABEL[x.kind]}{x.state === 'remplacee' ? ' · remplacée' : x.state === 'envoyee' ? ' · en attente de réponse' : ''}</div>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{sentSummary(x)}</div>
                        {x.state === 'repondue' && x.response && (
                          <div style={{ marginTop: 4 }}>
                            <strong>{RESPONSE_LABEL[x.response]}</strong>
                            {x.response === 'choisie' && x.response_choice !== null && x.kind === 'choix' ? ` : ${(x.payload as ChoicePayload).items[x.response_choice]?.title ?? ''}` : ''}
                            {x.answered_at ? <span className="a-sub"> · {fmtDate(x.answered_at, 'fr', DATE_TIME)}</span> : null}
                            {x.response_data && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{ideaLines(x.response_data).map((l) => <li key={l}>{l}</li>)}</ul>}
                            {x.candidate_comment && <div style={{ whiteSpace: 'pre-wrap' }}>« {x.candidate_comment} »</div>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Fold>
              {c.branch && (
                <Fold id="h-repondu" title="Ce qu’elle a répondu" bodyClassName="">
                  <p className="a-muted" style={{ margin: '0 0 8px' }}>
                    Ses réponses utiles pour le sujet, à lire avant les pistes. Tout le formulaire : onglet <Link href={tabHref('reponses')}>Réponses</Link>.
                  </p>
                  <dl className="a-qa">{topicSummary(c.branch, a).map((q) => (<div key={q.code}><dt>{q.label.fr}</dt><dd style={{ whiteSpace: 'pre-line' }}>{fmtVal(q, a[q.code])}</dd></div>))}</dl>
                </Fold>
              )}
              {(c.branch === 'A' || c.branch === 'B') && (
                <Fold id="h-pistes" title="Pistes de sujet" flush bodyClassName="">
                <EditScope>
                  <div className="a-card-head" style={{ flexWrap: 'wrap' }}>
                    <div>
                      <p className="a-muted" style={{ margin: 0 }}>
                        Rien n’est généré à l’envoi de son formulaire : écris d’abord tes précisions, puis « Générer les propositions » (modèles faits à partir de ses réponses) ou « Suggérer avec l’IA ».
                        Retiens 2 ou 3 pistes (« Retenir »), adapte-les, puis envoie-les : c’est la candidate qui choisit, « Choisir » ne s’active qu’une fois qu’elle a répondu.
                        « Régénérer » refait les propositions-modèles
                        et « Suggérer avec l’IA » les suggestions de l’IA, sauf les pistes retenues, écartées ou choisies (« Retenir » garde une piste, même réécrite).
                        {!aiConfigured() && !openaiConfigured() ? ' Suggestions de l’IA non activées sur ce serveur (clé API manquante).' : !c.completed_at ? ' Les suggestions de l’IA seront possibles quand le formulaire sera terminé.' : ' Les suggestions de l’IA sont à relire : elles peuvent se tromper. Chaque modèle ne remplace que ses propres suggestions non retenues.'}
                        {' La candidate ne voit pas ces pistes : seulement ce que tu lui envoies (« Envoyer les pistes retenues »).'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!lock && c.completed_at && (aiConfigured() || openaiConfigured()) && (
                        <InlineForm action={suggestTracksAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', flexBasis: '100%' }}>
                          <input type="hidden" name="cid" value={id} />
                          <label className="a-label" style={{ flex: '1 1 320px' }}>
                            Précisions pour l’IA (facultatif, gardées sur la fiche)
                            <AutoGrowTextarea className="a-input" name="ai_brief" defaultValue={c.ai_brief ?? ''} maxLength={800} placeholder="Ex. : elle vient du support et veut raconter sa reconversion vers le DevOps ; éviter le mobile." />
                          </label>
                          {([
                            ['claude', 'Claude', aiConfigured()],
                            ['openai', 'OpenAI', openaiConfigured()],
                          ] as const).filter(([, , on]) => on).map(([provider, name]) => (
                            <PendingButton key={provider} lockWhenEditing name="provider" value={provider} className="a-btn is-sm" pendingLabel={`${name} réfléchit…`} confirmText={`Envoyer à ${name} les réponses de cette candidate sur son sujet, son poste ou ses études, son ancienneté, le format souhaité, l’événement visé, tes précisions et les titres déjà sur sa fiche pour obtenir des titres ? Son nom et ses coordonnées ne sont pas envoyés (les adresses et numéros écrits dans ses réponses sont masqués ; un nom écrit dans une phrase ne peut pas l’être). Les suggestions de ${name} non retenues sont remplacées.`}>
                              <Icon name="spark" size={16} />Suggérer avec {name}
                            </PendingButton>
                          ))}
                        </InlineForm>
                      )}
                      {!lock && <InlineForm action={trackAction}><input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="regenerate" /><EditButton kind="other" className="a-btn is-ghost is-sm" locked={!c.completed_at} lockedReason={FORM_UNFINISHED}><Icon name="clock" size={16} />{tracks.some((t) => t.origin === 'personnelle' || t.origin === 'croisement') ? 'Régénérer' : 'Générer les propositions'}</EditButton></InlineForm>}
                    </div>
                  </div>
                  {tracks.length === 0 ? <p className="a-empty">Aucune piste.</p> : (
                    <>
                    <FoldAll selector="details.a-track-fold" />
                    <ul className="a-tracks">
                      {tracks.map((t, i) => (
                        <li key={t.id} className={`a-track${t.state === 'choisie' ? ' is-chosen' : ''}${t.state === 'retenue_coach' ? ' is-kept' : ''}${t.state === 'ecartee' ? ' is-out' : ''}`}>
                          {/* the tracks she works on (retained, chosen) stay open; the others fold so the page stays short */}
                          <details className="a-track-fold" open={t.state === 'retenue_coach' || t.state === 'choisie'}>
                          <summary className="a-track-summary">
                            <span className="a-num" aria-hidden="true">{i + 1}</span>
                            <span className="a-track-summary-title">{t.title}</span>
                            <span className={`a-pill is-${TRACK_TONE[t.state] ?? 'neutral'}`}>{TRACK_STATE[t.state] ?? t.state}</span>
                            <span className="a-sub">{FORMATS.find((o) => o.value === t.format)?.label.fr ?? t.format ?? 'Talk'}</span>
                          </summary>
                          {lock ? (
                          <div className="a-track-form">
                            <span className="a-num" aria-hidden="true">{i + 1}</span>
                            <div className="a-track-main">
                              <p className="a-track-title" style={{ margin: 0 }}>{t.title}</p>
                              <span className="a-track-meta">
                                <span className={`a-pill is-${TRACK_TONE[t.state] ?? 'neutral'}`}>{TRACK_STATE[t.state] ?? t.state}</span>
                                <span>{ORIGIN[t.origin] ?? t.origin}{t.origin === 'ia' ? ` · ${t.model ?? 'Claude'}` : ''}{t.domain ? ` · ${t.domain}` : ''}{t.angle ? ` · ${labelOf(refs.angles, t.angle, 'fr')}` : ''}</span>
                                <span>{FORMATS.find((o) => o.value === t.format)?.label.fr ?? t.format ?? 'Talk'}</span>
                              </span>
                              {t.hook && <span className="a-sub" style={{ whiteSpace: 'normal' }}>{t.hook}</span>}
                              {t.state === 'retenue_coach' && t.pitch && <span style={{ whiteSpace: 'normal' }}><strong>Pour la candidate :</strong> {t.pitch}</span>}
                            </div>
                          </div>
                          ) : (
                          <InlineForm action={trackAction} className="a-track-form" watchEdits>
                            <input type="hidden" name="cid" value={id} /><input type="hidden" name="track_id" value={t.id} />
                            <span className="a-num" aria-hidden="true">{i + 1}</span>
                            <div className="a-track-main">
                              <AutoGrowTextarea className="a-track-title" name="title" defaultValue={t.title} aria-label={`Titre de la piste ${i + 1}`} />
                              <span className="a-track-meta">
                                <span className={`a-pill is-${TRACK_TONE[t.state] ?? 'neutral'}`}>{TRACK_STATE[t.state] ?? t.state}</span>
                                <span>{ORIGIN[t.origin] ?? t.origin}{t.origin === 'ia' ? ` · ${t.model ?? 'Claude'}` : ''}{t.domain ? ` · ${t.domain}` : ''}{t.angle ? ` · ${labelOf(refs.angles, t.angle, 'fr')}` : ''}</span>
                                <select key={t.format ?? 'talk'} className="a-mini-select" name="format" defaultValue={t.format ?? 'talk'} aria-label={`Format de la piste ${i + 1}`}>
                                  <option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option>
                                </select>
                              </span>
                              {t.hook && <span className="a-sub" style={{ whiteSpace: 'normal' }}>{t.hook}</span>}
                              {t.state === 'retenue_coach' && (
                                <label className="a-label">Pour la candidate : pourquoi ce sujet lui irait
                                  <AutoGrowTextarea className="a-input" name="pitch" defaultValue={t.pitch ?? t.hook ?? ''} maxLength={400} aria-label={`Pour la candidate : pourquoi le sujet ${i + 1} lui irait`} />
                                </label>
                              )}
                              {t.state === 'retenue_coach' && !(t.pitch ?? '').trim() && <span className="a-sub" style={{ whiteSpace: 'normal' }}>Phrase pas encore enregistrée : relis-la, adapte-la pour elle, puis Enregistrer.</span>}
                            </div>
                            <div className="a-track-actions">
                              {/* A and B: « Choisir » waits for her choice; while a field of a track is being edited only its « Enregistrer » is lit */}
                              {t.state !== 'choisie' && <EditButton kind="other" name="op" value="choose" className="a-btn is-sm" locked={waitsForChoice} lockedReason={CHOOSE_AFTER_HER} aria-label={`Choisir la piste ${i + 1}`}>Choisir</EditButton>}
                              {t.state === 'generee' && <EditButton kind="other" name="op" value="shortlist" className="a-btn is-ghost is-sm" aria-label={`Retenir la piste ${i + 1}`}>Retenir</EditButton>}
                              {t.state === 'ecartee' ? <EditButton kind="other" name="op" value="restore" className="a-btn is-ghost is-sm" aria-label={`Rétablir la piste ${i + 1}`}>Rétablir</EditButton> : t.state !== 'choisie' && <EditButton kind="other" name="op" value="discard" className="a-link-btn" aria-label={`Écarter la piste ${i + 1}`}>Écarter</EditButton>}
                              <EditButton kind="save" name="op" value="save" className="a-btn is-ghost is-sm" litClassName="is-lit" unsaved={t.state === 'retenue_coach' && !(t.pitch ?? '').trim()} aria-label={`Enregistrer la piste ${i + 1}`}>Enregistrer</EditButton>
                              <EditCancel />
                              {t.origin === 'coach' && <EditButton kind="other" name="op" value="delete" className="a-link-btn is-danger" aria-label={`Supprimer la piste ${i + 1}`}>Supprimer</EditButton>}
                            </div>
                          </InlineForm>
                          )}
                          </details>
                        </li>
                      ))}
                    </ul>
                    </>
                  )}
                  {!lock && (
                    <InlineForm action={trackAction} className="a-add-track" resetOnSuccess>
                      <input type="hidden" name="cid" value={id} /><input type="hidden" name="op" value="add" />
                      <input className="a-input" name="title" placeholder="Ajouter ma propre piste…" aria-label="Nouvelle piste" />
                      <select className="a-select-f" name="format" aria-label="Format de la nouvelle piste" style={{ width: 'auto' }}><option value="talk">Talk</option><option value="lightning">Lightning talk</option><option value="atelier">Atelier</option></select>
                      <EditButton kind="other" className="a-btn is-ghost" locked={!c.completed_at} lockedReason={FORM_UNFINISHED}>Ajouter</EditButton>
                    </InlineForm>
                  )}
                  {!lock && (
                    <InlineForm action={sendChoiceAction} className="a-stack" style={{ gap: 6, padding: '12px 16px' }}>
                      <input type="hidden" name="cid" value={id} />
                      <div><PendingButton lockWhenEditing className="a-btn" pendingLabel="Envoi…" confirmText={`Envoyer à la candidate les ${retained.length} pistes retenues, avec leur phrase ? Elle reçoit un email et choisit dans son espace. Pistes et sujet resteront verrouillés jusqu’à sa réponse.`} disabled={!choiceReady}>Envoyer les pistes retenues à la candidate ({retained.length})</PendingButton></div>
                      <span className="a-sub" style={{ whiteSpace: 'normal' }}>{choiceHint}</span>
                    </InlineForm>
                  )}
                </EditScope>
                </Fold>
              )}

              <Fold id="h-sujet" title="Sujet retenu et candidature">
                <EditScope>
                <p className="a-muted" style={{ margin: 0 }}>Se remplit tout seul quand la candidate a choisi une piste ; à compléter avant de valider le sujet.</p>
                {herIdeas && (
                  <div role="note" aria-label="Ce qu’elle a imaginé" style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-sunken)' }}>
                    <p className="a-eyebrow" style={{ margin: '0 0 6px' }}>Ce qu’elle a imaginé pour « {herIdeas.title} »</p>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{ideaLines(herIdeas.ideas).map((l) => <li key={l}>{l}</li>)}</ul>
                  </div>
                )}
                {!lock && c.completed_at && startSubject && (aiConfigured() || openaiConfigured()) && (
                  <InlineForm action={improveSubjectAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <input type="hidden" name="cid" value={id} />
                    <label className="a-label" style={{ flex: '1 1 320px' }}>
                      Précisions pour l’IA (facultatif, gardées sur la fiche)
                      <AutoGrowTextarea className="a-input" name="ai_brief" defaultValue={c.ai_brief ?? ''} maxLength={800} placeholder="Ex. : garder son exemple réel ; viser un public débutant ; plus orienté démo." />
                    </label>
                    {([
                      ['claude', 'Claude', aiConfigured()],
                      ['openai', 'OpenAI', openaiConfigured()],
                    ] as const).filter(([, , on]) => on).map(([provider, name]) => (
                      <PendingButton key={provider} lockWhenEditing name="provider" value={provider} className="a-btn is-sm" pendingLabel={`${name} réfléchit…`} confirmText={`Envoyer à ${name} son sujet actuel (titre, résumé${c.branch === 'C' ? ', idées clés' : ''}), son poste ou ses études, son ancienneté, l’événement visé et tes précisions pour obtenir une proposition d’amélioration ? Son nom et ses coordonnées ne sont pas envoyés (les adresses et numéros écrits dans ses réponses sont masqués ; un nom écrit dans une phrase ne peut pas l’être). La proposition précédente est remplacée.`}>
                        <Icon name="spark" size={16} />Améliorer avec {name}
                      </PendingButton>
                    ))}
                  </InlineForm>
                )}
                {!lock && proposal && (
                  <div className="a-stack" role="region" aria-labelledby="h-proposition" style={{ gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-sunken)' }}>
                    <h3 id="h-proposition" className="a-eyebrow" style={{ margin: 0, color: 'var(--amber-text)' }}>Proposition d’amélioration · {proposal.model} · {fmtDate(proposal.created_at, 'fr', DATE_TIME)}</h3>
                    {proposal.note && <p style={{ margin: 0 }}><strong>Ce qui change :</strong> {proposal.note}</p>}
                    <div>
                      <p className="a-label" style={{ margin: '0 0 4px' }}>Titres</p>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                        {proposal.titles.map((t, k) => <li key={k}><span style={{ marginRight: 8 }}>{t}</span><UseInField target="subject-title" value={t} label={`Utiliser le titre : ${t}`}>Utiliser ce titre</UseInField></li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="a-label" style={{ margin: '0 0 4px' }}>Résumé <span className="a-muted" style={{ fontWeight: 400 }}>({wordCount(proposal.abstract)} mots)</span></p>
                      <p style={{ margin: '0 0 6px', whiteSpace: 'pre-line' }}>{proposal.abstract}</p>
                      <UseInField target="subject-abstract" value={proposal.abstract}>Utiliser ce résumé</UseInField>
                    </div>
                    <div>
                      <p className="a-label" style={{ margin: '0 0 4px' }}>Comment aborder le sujet</p>
                      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>{proposal.plan.map((s, k) => <li key={k}>{s}</li>)}</ol>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        <UseInField target="subject-why" value={proposal.note}>Utiliser comme « Pourquoi »</UseInField>
                        <UseInField target="subject-plan" value={proposal.plan.join('\n')}>Utiliser ce plan</UseInField>
                      </div>
                    </div>
                    <p className="a-muted" style={{ margin: 0 }}>« Utiliser » remplit le formulaire ci-dessous : rien n’est enregistré avant « Enregistrer le sujet ».</p>
                  </div>
                )}
                {lock ? (
                  <dl className="a-qa">
                    <div><dt>Titre</dt><dd>{subject?.title || '—'}</dd></div>
                    <div><dt>Résumé</dt><dd style={{ whiteSpace: 'pre-line' }}>{subject?.abstract || '—'}</dd></div>
                    <div><dt>Pourquoi ces changements</dt><dd style={{ whiteSpace: 'pre-line' }}>{subject?.why || '—'}</dd></div>
                    <div><dt>Comment t’y prendre</dt><dd style={{ whiteSpace: 'pre-line' }}>{subject?.plan || '—'}</dd></div>
                    <div><dt>Niveau du public</dt><dd>{AUDIENCES.find((o) => o.value === subject?.audience)?.label.fr ?? '—'}</dd></div>
                    <div><dt>Format</dt><dd>{FORMATS.find((o) => o.value === subject?.format)?.label.fr ?? '—'}</dd></div>
                    <div><dt>État de la candidature</dt><dd>{APPLICATION_STATES.find((o) => o.value === (subject?.application_state ?? 'a_soumettre'))?.label.fr ?? '—'}</dd></div>
                  </dl>
                ) : (
                <InlineForm action={saveSubjectAction} className="a-stack" watchEdits>
                  <input type="hidden" name="id" value={id} />
                  <label className="a-label">Titre<input id="subject-title" className="a-input" name="title" defaultValue={subject?.title ?? ''} placeholder="Choisis une piste ou écris le titre" /></label>
                  <label className="a-label">Résumé
                    <textarea id="subject-abstract" className="a-textarea" name="abstract" defaultValue={subject?.abstract ?? ''} placeholder="Ce que le public va comprendre, voir, repartir avec…" />
                    <span className="a-sub" style={{ fontWeight: 400 }}>{wordCount(subject?.abstract ?? '')} mots · cible : 80 à 200</span>
                  </label>
                  <label className="a-label">Pourquoi ces changements (pour la candidate)<textarea id="subject-why" className="a-textarea" name="why" defaultValue={subject?.why ?? ''} maxLength={1500} /></label>
                  <label className="a-label">Comment t’y prendre (une étape par ligne)<textarea id="subject-plan" className="a-textarea" name="plan" defaultValue={subject?.plan ?? ''} /></label>
                  <div className="a-grid-3">
                    <label className="a-label">Niveau du public<select key={subject?.audience ?? ''} className="a-select-f" name="audience" defaultValue={subject?.audience ?? ''}><option value="">—</option>{AUDIENCES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                    <label className="a-label">Format<select key={subject?.format ?? ''} className="a-select-f" name="format" defaultValue={subject?.format ?? ''}><option value="">—</option>{FORMATS.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                    <label className="a-label">État de la candidature<select key={subject?.application_state ?? 'a_soumettre'} className="a-select-f" name="application_state" defaultValue={subject?.application_state ?? 'a_soumettre'}>{APPLICATION_STATES.map((o) => <option key={o.value} value={o.value}>{o.label.fr}</option>)}</select></label>
                  </div>
                  <div className="a-actions"><EditButton kind="save" className="a-btn">Enregistrer le sujet</EditButton><EditCancel /></div>
                </InlineForm>
                )}
                {!lock && (
                  <InlineForm action={sendSubjectAction} className="a-stack" style={{ gap: 6 }}>
                    <input type="hidden" name="cid" value={id} />
                    <div><PendingButton lockWhenEditing className="a-btn" pendingLabel="Envoi…" disabled={!subjectReady || waitsForChoice} confirmText="Envoyer à la candidate le sujet enregistré (titre, résumé, pourquoi, plan) pour validation ? Pense à enregistrer tes dernières modifications avant. Pistes et sujet resteront verrouillés jusqu’à sa réponse.">Envoyer à la candidate pour validation</PendingButton></div>
                    {waitsForChoice ? <span className="a-sub" style={{ whiteSpace: 'normal' }}>{NEEDS_CHOICE} Ce bouton s’active quand elle aura choisi.</span>
                      : !subjectReady && <span className="a-sub" style={{ whiteSpace: 'normal' }}>Enregistre d’abord un titre et un résumé (bouton « Enregistrer le sujet »).</span>}
                  </InlineForm>
                )}
                </EditScope>
              </Fold>

              {c.branch === 'D' && (
                <Fold id="h-grille" title="Grille de relecture" flush bodyClassName="">
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
                </Fold>
              )}
            </>
          )}

          {tab === 'reponses' && (
            <Fold id="h-reponses" title="Réponses au formulaire" bodyClassName="">
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
            </Fold>
          )}

          {tab === 'notes' && (
            <>
              <Fold id="h-notes" title="Notes de suivi">
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
              </Fold>
              <Fold id="h-hist" title="Historique des statuts">
                {history.length === 0 ? <p className="a-muted" style={{ margin: 0 }}>Aucun changement.</p> : (
                  <ul className="a-hist">
                    {history.map((h, i) => (
                      <li key={i}><span>{h.old_status ? `${statusLabel(h.old_status)} → ` : ''}<strong>{statusLabel(h.new_status)}</strong></span><span className="a-sub" style={{ whiteSpace: 'normal' }}>{h.author} · {fmtDate(h.at, 'fr', DATE_TIME)}</span></li>
                    ))}
                  </ul>
                )}
              </Fold>
            </>
          )}

          {tab === 'photos' && (
            <Fold id="h-photos" title="Photos de speaker">
              {photos.length === 0 ? (
                <div className="a-emptybox">
                  <span className="a-emptyicon" aria-hidden="true"><Icon name="users" size={26} /></span>
                  <strong>Aucune photo déposée</strong>
                  <p className="a-muted" style={{ margin: 0, maxWidth: '46ch' }}>Elle peut en ajouter une depuis son plan de route. La photo sert au visuel de speaker quand sa candidature est retenue.{c.completed_at ? '' : ' Son formulaire n’est pas encore terminé.'}</p>
                  {wa && <a className="a-btn is-ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">Lui demander sur WhatsApp</a>}
                </div>
              ) : (
                <>
                  {c.photo_validated_at && <p style={{ margin: 0 }}><strong>Photo validée le {fmtDate(c.photo_validated_at, 'fr', DATE_TIME)}</strong></p>}
                  <p className="a-muted" style={{ margin: 0 }}>Consentement à l’usage : <strong style={{ color: 'var(--ink)' }}>{c.consent_photo ? 'oui' : 'non'}</strong></p>
                  <div className="photo-admin">
                    {photos.map((p) => (
                      <figure key={p.id} className={p.id === c.selected_photo_id ? 'sel' : ''}>
                        <a href={`/api/photos/${p.id}`} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/photos/${p.id}`} alt={`Photo ${p.id}`} /></a>
                        <figcaption className="a-sub">{p.width && p.height ? `${p.width}×${p.height}` : ''} · {Math.max(1, Math.round(p.size / 1024))} Ko</figcaption>
                        <InlineForm action={selectPhotoAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="photo_id" value={p.id === c.selected_photo_id ? 0 : p.id} />
                          <button className={`a-btn is-sm${p.id === c.selected_photo_id ? '' : ' is-ghost'}`}>{p.id === c.selected_photo_id ? '✓ Retenue' : 'Retenir'}</button></InlineForm>
                        <InlineForm action={validatePhotoAction}><input type="hidden" name="cid" value={id} /><input type="hidden" name="photo_id" value={p.id} />
                          {p.id === c.selected_photo_id && c.photo_validated_at
                            ? <span className="a-pill is-green">✓ Validée</span>
                            : <button className="a-btn is-sm is-ghost" aria-label={`Valider la photo ${p.id}`}>Valider cette photo</button>}</InlineForm>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {submitted ? <p className="a-sub" style={{ whiteSpace: 'normal', margin: 0 }}>{SUBMITTED_NOTE}</p> : (
                <InlineForm action={requestPhotoAction} className="a-stack" style={{ gap: 8 }} resetOnSuccess>
                  <input type="hidden" name="cid" value={id} />
                  <label className="a-label">Demander une autre photo (dis-lui ce qu’il faut changer)
                    <textarea className="a-textarea" name="comment" required maxLength={1000} />
                  </label>
                  <div><button className="a-btn is-ghost">Demander une autre photo</button></div>
                </InlineForm>
              )}
            </Fold>
          )}

          {tab === 'plan' && rm && (
            <Fold id="h-plan" title="Plan de route" card={false} bodyClassName="">
              <p className="a-muted" style={{ margin: '0 0 12px' }}>Le plan de route tel que la candidate le voit.</p>
              <RoadmapView rm={rm} locale={c.locale} photoUrl={selPhoto ? `/api/photos/${selPhoto.id}` : photos[0] ? `/api/photos/${photos[0].id}` : null} internalDeadline={null} />
            </Fold>
          )}
        </div>

        <aside className="a-side">
          <Fold id="h-contact" title="Contact">
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
          </Fold>

          <Fold id="h-suivi" anchor="suivi" title="Suivi" bodyClassName="">
            <form action={followUpAction} className="a-stack">
              <input type="hidden" name="id" value={id} /><input type="hidden" name="tab" value={tab === 'sujet' ? '' : tab} />
              {/* what the page showed: only a field she changes is saved, so a page left open never overwrites what a colleague did meanwhile */}
              <input type="hidden" name="was_status" value={c.status} /><input type="hidden" name="was_coach" value={c.coach_id ?? ''} /><input type="hidden" name="was_date" value={c.next_point_date ?? ''} />
              <label className="a-label">Statut<select className="a-select-f" name="status" defaultValue={c.status}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="a-label">Coach assignée {coach && !coach.active ? '(accès désactivé)' : ''}<select className="a-select-f" name="coach_id" defaultValue={c.coach_id ?? ''}><option value="">— aucune —</option>{coaches.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === me.id ? ' (toi)' : ''}</option>)}</select></label>
              <label className="a-label">Prochain point<input className="a-input" type="date" name="next_point_date" defaultValue={c.next_point_date ?? ''} /></label>
              <button className="a-btn">Enregistrer le suivi</button>
            </form>
          </Fold>

          {lock ? <p className="a-sub" style={{ margin: 0, whiteSpace: 'normal' }}>Suppression de la candidate impossible pendant les échanges (proposition en attente, sujet approuvé ou candidature soumise).</p> : (
          <details className="a-card a-danger-zone">
            <summary>Supprimer la candidate</summary>
            <form action={deleteCandidateAction} className="a-stack" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={id} />
              <p className="a-muted" style={{ margin: 0 }}>Supprime définitivement la fiche, les réponses et les photos. Tape SUPPRIMER pour confirmer.</p>
              <input className="a-input" name="confirm" aria-label="Confirmation" autoComplete="off" />
              <button className="a-btn is-danger">Supprimer la candidate</button>
            </form>
          </details>
          )}
          <p className="a-sub" style={{ margin: 0 }}>Point de départ : {c.branch ? BRANCH_LABEL[c.branch] : '—'}</p>
        </aside>
      </div>
    </div>
  );
}
