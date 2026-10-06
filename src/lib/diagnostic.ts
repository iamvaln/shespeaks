// Diagnostic journey service: save a screen, advance, complete (recap, tracks, subject, emails).
import { get, getSetting, run, tx } from './db.ts';
import { SCREENS, SELF_CHECKS, flowFor, profileColumns, validateScreen, visibleQuestions, type Answers, type Branch, type FieldErrors, type Locale } from './questions.ts';
import {
  cityLabel, createCandidate, deleteAnswers, getAnswers, getCandidate, getCoach, getPhotos, getRefs, getSubject, getTracks, setAnswers,
  setStatus, touchCandidate, type Candidate,
} from './data.ts';
import { assembleAbstract } from './abstract.ts';
import { autoChecks } from './review.ts';
import { generateTracks } from './topics.ts';
import { appUrl, candidateConfirmation, candidateStarted, coachNewDiagnostic, sendMail } from './mail.ts';

export const BRANCH_LABEL: Record<Branch, string> = {
  A: 'A · Recherche de sujet',
  B: 'B · Domaine de prédilection',
  C: 'C · Sujet précis à décrire',
  D: 'D · Proposition prête',
};

export interface WizardState {
  candidate: { name: string; branch: Branch | null; current: string; completed: boolean; locale: Locale };
  answers: Answers;
  refs: ReturnType<typeof getRefs>;
  photos: { id: number; width: number | null; height: number | null; size: number }[];
  consent: boolean;
  /** abstract draft for C2 (assembled unless hand-edited) */
  draft: string | null;
}

export function wizardState(c: Candidate): WizardState {
  const answers = getAnswers(c.id);
  const sub = getSubject(c.id);
  let draft: string | null = null;
  if (c.branch === 'C') {
    const stored = typeof answers['C-abstract'] === 'string' ? (answers['C-abstract'] as string) : null;
    draft = sub?.abstract_edited && stored ? stored : assembleAbstract(answers, c.locale);
  }
  return {
    candidate: { name: c.name ?? '', branch: c.branch, current: c.current_screen, completed: !!c.completed_at, locale: c.locale },
    answers,
    refs: getRefs(),
    photos: getPhotos(c.id).map((p) => ({ id: p.id, width: p.width, height: p.height, size: p.size })),
    consent: !!c.consent_photo,
    draft,
  };
}

export type SubmitResult =
  | { ok: false; errors: FieldErrors; fatal?: string }
  | { ok: true; token: string; next: string; created: boolean; completed: boolean };

/**
 * Persist one screen (autosave at every step). `token` null = no candidate yet (only the profile screen can create one).
 */
export function submitScreen(token: string | null, screenId: string, values: Answers, ui: Locale): SubmitResult {
  const screen = SCREENS[screenId];
  if (!screen) return { ok: false, errors: {}, fatal: 'unknown_screen' };
  const refs = getRefs();

  let c = token ? get<Candidate>('SELECT * FROM candidates WHERE token=?', token) : undefined;
  if (!c && screenId !== 'profile') return { ok: false, errors: {}, fatal: 'no_session' };
  if (c?.completed_at) return { ok: false, errors: {}, fatal: 'already_completed' };
  const existing = c ? getAnswers(c.id) : {};
  const merged: Answers = { ...existing, ...values };

  // The pivot decides which screens are legal; others are only reachable once it is set.
  const branch: Branch | null = (screenId === 'diag2' ? (values['D6'] as Branch | undefined) : undefined) ?? c?.branch ?? null;
  if (screenId !== 'profile' && screenId !== 'diag1' && screenId !== 'diag2' && !flowFor(branch).includes(screenId)) {
    return { ok: false, errors: {}, fatal: 'wrong_branch' };
  }

  let errors: FieldErrors = validateScreen(screen, merged, refs);
  const photos = c ? getPhotos(c.id) : [];
  if (screen.kind === 'photo') {
    errors = {};
    if (photos.length > 0 && !values['consent']) errors['consent'] = 'consent_required';
    if (photos.length === 0 && !values['later']) errors['photo'] = 'photo_or_later';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const result = tx(() => {
    let created = false;
    if (!c) {
      c = createCandidate(ui);
      created = true;
    }
    const id = c.id;
    const toSave: Answers = {};
    for (const q of visibleQuestions(screen, merged)) if (merged[q.code] !== undefined) toSave[q.code] = merged[q.code];
    // drop answers of questions hidden by a conditional
    deleteAnswers(id, screen.questions.filter((q) => q.showIf && !q.showIf(merged)).map((q) => q.code));

    if (screen.kind === 'draft') {
      const text = String(values['C-abstract'] ?? '');
      const assembled = assembleAbstract(merged, c.locale);
      toSave['C-abstract'] = text;
      run(
        `INSERT INTO subjects (candidate_id, abstract_edited) VALUES (?,?)
         ON CONFLICT(candidate_id) DO UPDATE SET abstract_edited=excluded.abstract_edited`,
        id, text.trim() === assembled.trim() ? 0 : 1,
      );
    }
    if (screen.kind === 'review') {
      for (const s of SELF_CHECKS) toSave[`chk_${s.code}`] = values[`chk_${s.code}`] ? '1' : '0';
      const title = String(merged['D1-a'] ?? '');
      const abstract = String(merged['D1-b'] ?? '');
      for (const r of autoChecks(title, abstract)) {
        const value = r.words !== undefined ? String(r.words) : (r.keyword ?? '');
        run(
          `INSERT INTO review_items (candidate_id,criterion,result,value) VALUES (?,?,?,?)
           ON CONFLICT(candidate_id,criterion) DO UPDATE SET result=excluded.result, value=excluded.value`,
          id, r.code, r.ok ? 'ok' : 'a_revoir', value,
        );
      }
      for (const s of SELF_CHECKS) {
        run(
          `INSERT INTO review_items (candidate_id,criterion,result,value) VALUES (?,?,?,NULL)
           ON CONFLICT(candidate_id,criterion) DO UPDATE SET result=excluded.result`,
          id, s.code, values[`chk_${s.code}`] ? 'coche' : 'non_coche',
        );
      }
    }
    setAnswers(id, toSave);

    if (screenId === 'profile') {
      const p = profileColumns({ ...existing, ...toSave });
      run(
        `UPDATE candidates SET name=?, city=?, city_other=?, whatsapp=?, email=?, talk_language=?, role=?, seniority=? WHERE id=?`,
        p.name, p.city, p.city_other, p.whatsapp, p.email, p.talk_language, p.role, p.seniority, id,
      );
    }
    let newBranch = c.branch;
    if (screenId === 'diag2') {
      newBranch = String(merged['D6']) as Branch;
      run('UPDATE candidates SET branch=? WHERE id=?', newBranch, id);
    }
    if (screen.kind === 'photo') run('UPDATE candidates SET consent_photo=? WHERE id=?', values['consent'] ? 1 : 0, id);

    // Advance
    const flow = flowFor(newBranch);
    const idx = flow.indexOf(screenId);
    const nextId = idx + 1 < flow.length ? flow[idx + 1] : 'done';
    const furthest = flow.indexOf(c.current_screen);
    const sameBranch = newBranch === c.branch;
    // Resume pointer = furthest screen reached (editing an earlier screen does not move it backwards).
    const pointer = nextId !== 'done' && sameBranch && furthest > idx + 1 ? c.current_screen : nextId;
    run('UPDATE candidates SET current_screen=? WHERE id=?', pointer, id);
    touchCandidate(id, true);
    return { id, created, nextId, token: c.token };
  });

  const fresh = getCandidate(result.id)!;
  if (result.created && fresh.email) {
    const m = candidateStarted({ name: fresh.name ?? '' }, `${appUrl()}/reprendre/${fresh.token}`, fresh.locale);
    void sendMail({ ...m, to: fresh.email, kind: 'candidate_started', candidateId: fresh.id });
  }
  let completed = false;
  if (result.nextId === 'done') {
    completeDiagnostic(fresh.id);
    completed = true;
  }
  return { ok: true, token: result.token, next: result.nextId, created: result.created, completed };
}

/** Last screen validated: build the recap, set the status, generate tracks, notify. */
export function completeDiagnostic(id: number) {
  const c = getCandidate(id)!;
  if (c.completed_at) return;
  const a = getAnswers(id);
  const refs = getRefs();
  tx(() => {
    run(`UPDATE candidates SET completed_at=datetime('now'), current_screen='done' WHERE id=?`, id);
    setStatus(id, 'diagnostic_recu', 'système');
    const fmt = a['D4'] && a['D4'] !== 'ouverte' ? String(a['D4']) : null;
    if (c.branch === 'A' || c.branch === 'B') {
      const tracks = generateTracks(a, c.branch, c.locale, refs);
      tracks.forEach((t, i) =>
        run('INSERT INTO tracks (candidate_id,title,angle,format,domain,hook,origin,position) VALUES (?,?,?,?,?,?,?,?)', id, t.title, t.angle, t.format, t.domain, t.hook ?? null, t.origin, i),
      );
      run('INSERT OR IGNORE INTO subjects (candidate_id,audience,format) VALUES (?,?,?)', id, c.branch === 'B' ? String(a['B3'] ?? '') : null, fmt);
    } else if (c.branch === 'C') {
      run(
        `INSERT INTO subjects (candidate_id,title,abstract,audience,format) VALUES (?,?,?,?,?)
         ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format`,
        id, String(a['C1'] ?? ''), String(a['C-abstract'] ?? ''), String(a['C2'] ?? ''), fmt,
      );
    } else if (c.branch === 'D') {
      run(
        `INSERT INTO subjects (candidate_id,title,abstract,audience,format,application_state) VALUES (?,?,?,?,?,?)
         ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format, application_state=excluded.application_state`,
        id, String(a['D1-a'] ?? ''), String(a['D1-b'] ?? ''), String(a['D1-c'] ?? ''), fmt, String(a['D1-d'] ?? 'a_soumettre'),
      );
    }
  });
  notifyCompletion(id);
}

export function coachRecipients(c: Candidate): { name: string; email: string }[] {
  const out = new Map<string, string>();
  const coach = getCoach(c.coach_id);
  if (coach?.active) out.set(coach.email.toLowerCase(), coach.name);
  const extra = getSetting('notification_email').trim();
  for (const e of extra.split(/[,;\s]+/).filter(Boolean)) if (!out.has(e.toLowerCase())) out.set(e.toLowerCase(), 'SheSpeaks');
  return [...out].map(([email, name]) => ({ name, email }));
}

function notifyCompletion(id: number) {
  const c = getCandidate(id)!;
  const a = getAnswers(id);
  const sub = getSubject(id);
  // candidate: confirmation of reception
  if (c.email) {
    const m = candidateConfirmation({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale);
    void sendMail({ ...m, to: c.email, kind: 'candidate_confirmation', candidateId: id });
  }
  // coach(es) / admin: new diagnostic, with direct link to the fiche
  const m = coachNewDiagnostic(
    {
      name: c.name ?? '', cityLabel: cityLabel(c), branchLabel: c.branch ? BRANCH_LABEL[c.branch] : '—',
      whatsapp: c.whatsapp ?? '', email: c.email, subject: sub?.title || String(a['C1'] ?? a['D1-a'] ?? '') || null,
    },
    `${appUrl()}/admin/candidates/${id}`,
  );
  for (const r of coachRecipients(c)) void sendMail({ ...m, to: r.email, kind: 'coach_new_diagnostic', candidateId: id });
}

/** Regenerate the 5 tracks (coach action). Keeps coach-added and chosen tracks. */
export function regenerateTracks(id: number) {
  const c = getCandidate(id);
  if (!c || (c.branch !== 'A' && c.branch !== 'B')) return;
  const a = getAnswers(id);
  const kept = getTracks(id).filter((t) => t.origin === 'coach' || t.state === 'choisie');
  run(`DELETE FROM tracks WHERE candidate_id=? AND NOT (origin='coach' OR state='choisie')`, id);
  const have = new Set(kept.map((t) => t.title.toLowerCase()));
  const gen = generateTracks(a, c.branch, c.locale, getRefs(), 2026, 5).filter((t) => !have.has(t.title.toLowerCase()));
  const base = kept.length;
  gen.slice(0, Math.max(0, 5 - kept.filter((t) => t.origin !== 'coach').length)).forEach((t, i) =>
    run('INSERT INTO tracks (candidate_id,title,angle,format,domain,hook,origin,position) VALUES (?,?,?,?,?,?,?,?)', id, t.title, t.angle, t.format, t.domain, t.hook ?? null, t.origin, base + i),
  );
}
