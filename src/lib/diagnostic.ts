// Diagnostic journey service: save a screen, advance, complete (recap, tracks, subject, emails).
import { get, getSetting, run, tx } from './db.ts';
import { SCREENS, SELF_CHECKS, flowFor, profileColumns, resumeScreen, validateScreen, visibleQuestions, type Answers, type Branch, type FieldErrors, type Locale } from './questions.ts';
import {
  eventLabelFor, createCandidate, deleteAnswers, getAnswers, getCandidate, getCoach, getFormRefs, getRefs, getSubject, getTracks, setAnswers,
  setStatus, touchCandidate, type Candidate,
} from './data.ts';
import { assembleAbstract } from './abstract.ts';
import { autoChecks } from './review.ts';
import { generateTracks } from './topics.ts';
import { journeysOf } from './resume-code.ts';
import { requestAccess } from './access.ts';
import { admission } from './admission.ts';
import { todayIso } from './dates.ts';
import { emailDomainAccepts, isWhatsappNumber, mailboxKey, strictContactChecks } from './contact.ts';
import { checkChangeRate, checkCreateEmail } from './ratelimit.ts';
import { appUrl, candidateConfirmation, candidateStarted, coachNewDiagnostic, deferMail, sendMail } from './mail.ts';

export const BRANCH_LABEL: Record<Branch, string> = {
  A: 'A · Recherche de sujet',
  B: 'B · Domaine de prédilection',
  C: 'C · Sujet précis à décrire',
  D: 'D · Proposition prête',
};

export interface WizardState {
  candidate: { name: string; branch: Branch | null; current: string; completed: boolean; locale: Locale };
  answers: Answers;
  refs: Awaited<ReturnType<typeof getFormRefs>>;
  /** abstract draft for C2 (assembled unless hand-edited) */
  draft: string | null;
}

export async function wizardState(c: Candidate): Promise<WizardState> {
  const answers = await getAnswers(c.id);
  const sub = await getSubject(c.id);
  let draft: string | null = null;
  if (c.branch === 'C') {
    const stored = typeof answers['C-abstract'] === 'string' ? (answers['C-abstract'] as string) : null;
    draft = sub?.abstract_edited && stored ? stored : assembleAbstract(answers, c.locale);
  }
  return {
    candidate: { name: c.name ?? '', branch: c.branch, current: resumeScreen(c.branch, c.current_screen), completed: !!c.completed_at, locale: c.locale },
    answers,
    refs: await getFormRefs(todayIso(), c),
    draft,
  };
}

export type SubmitResult =
  | { ok: false; errors: FieldErrors; fatal?: string; canStartNew?: boolean; closedOn?: string | null }
  | { ok: true; token: string; next: string; created: boolean; completed: boolean };

/**
 * Persist one screen (autosave at every step). `token` null = no candidate yet (only the profile screen can create one).
 */
export async function submitScreen(token: string | null, screenId: string, values: Answers, ui: Locale, ip = 'unknown', startNew = false): Promise<SubmitResult> {
  const screen = SCREENS[screenId];
  if (!screen) return { ok: false, errors: {}, fatal: 'unknown_screen' };
  let c = token ? await get<Candidate>('SELECT * FROM candidates WHERE token=?', token) : undefined;
  const refs = await getFormRefs(todayIso(), c); // a dossier that exists may keep the event she chose, even one no longer offered
  if (!c && screenId !== 'profile') return { ok: false, errors: {}, fatal: 'no_session' };
  if (c?.completed_at) return { ok: false, errors: {}, fatal: 'already_completed' };
  const gate = await admission(c);
  if (!gate.open) return { ok: false, errors: {}, fatal: 'closed', closedOn: gate.closedOn };
  const existing = c ? await getAnswers(c.id) : {};
  const merged: Answers = { ...existing, ...values };

  // The pivot decides which screens are legal; others are only reachable once it is set.
  const branch: Branch | null = (screenId === 'diag2' ? (values['D6'] as Branch | undefined) : undefined) ?? c?.branch ?? null;
  if (screenId !== 'profile' && screenId !== 'diag1' && screenId !== 'diag2' && !flowFor(branch).includes(screenId)) {
    return { ok: false, errors: {}, fatal: 'wrong_branch' };
  }

  const errors: FieldErrors = validateScreen(screen, merged, refs);
  // In production the contact details must be real: a number libphonenumber accepts, a domain that takes mail.
  if (screenId === 'profile' && strictContactChecks()) {
    if (!errors.P3 && !isWhatsappNumber(String(merged['P3'] ?? ''))) errors.P3 = 'invalid_whatsapp';
    if (!errors.P4 && !(await emailDomainAccepts(String(merged['P4'] ?? '')))) errors.P4 = 'undeliverable_email';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  // Her journey is found by her email, not by the browser (an in-app browser keeps no cookie, she may switch phones): an address that
  // already has a journey does not start a second one. She receives a code and her links by email and types the code back (resume-code.ts).
  // Another journey (another event) can be started only once all of hers are finished, and only when she asks for it.
  if (screenId === 'profile' && !c) {
    const email = String(merged['P4'] ?? '').trim();
    const mine = email ? await journeysOf(email) : [];
    const allDone = mine.every((r) => !!r.completed_at);
    if (mine.length && !(startNew && allDone)) {
      await requestAccess(email, ip);
      return { ok: false, errors: {}, fatal: 'resume_needed', canStartNew: allDone };
    }
  }

  // Reminders and the confirmation go to the address on the profile, so an address is « used » when a candidate is created with it
  // AND when an existing candidate changes to it: at most a few per mailbox and hour, counted only now that the form is valid
  // (a typo elsewhere on the screen must not use up the allowance) and before anything is created, changed or queued. Saving the
  // same mailbox again (Back, then Next) costs nothing.
  if (screenId === 'profile') {
    const email = String(merged['P4'] ?? '').trim();
    const changing = !!c && mailboxKey(email) !== mailboxKey(c.email ?? '');
    if (email && (!c || changing)) {
      // a change needs no new cookie, so it has its own ceilings, charged before the mailbox so a refusal there spares the target's allowance
      if (c && !(await checkChangeRate(ip, c.id)).ok) return { ok: false, errors: {}, fatal: 'rate_limited' };
      if (!(await checkCreateEmail(email)).ok) return { ok: false, errors: {}, fatal: 'email_rate_limited' };
    }
  }

  const result = await tx(async () => {
    let created = false;
    if (!c) {
      c = await createCandidate(ui);
      created = true;
    }
    const cur = c;
    const id = cur.id;
    const toSave: Answers = {};
    for (const q of visibleQuestions(screen, merged)) if (merged[q.code] !== undefined) toSave[q.code] = merged[q.code];
    // drop answers of questions hidden by a conditional
    await deleteAnswers(id, screen.questions.filter((q) => q.showIf && !q.showIf(merged)).map((q) => q.code));

    if (screen.kind === 'draft') {
      const text = String(values['C-abstract'] ?? '');
      const assembled = assembleAbstract(merged, cur.locale);
      toSave['C-abstract'] = text;
      await run(
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
        await run(
          `INSERT INTO review_items (candidate_id,criterion,result,value) VALUES (?,?,?,?)
           ON CONFLICT(candidate_id,criterion) DO UPDATE SET result=excluded.result, value=excluded.value`,
          id, r.code, r.ok ? 'ok' : 'a_revoir', value,
        );
      }
      for (const s of SELF_CHECKS) {
        await run(
          `INSERT INTO review_items (candidate_id,criterion,result,value) VALUES (?,?,?,NULL)
           ON CONFLICT(candidate_id,criterion) DO UPDATE SET result=excluded.result`,
          id, s.code, values[`chk_${s.code}`] ? 'coche' : 'non_coche',
        );
      }
    }
    await setAnswers(id, toSave);

    if (screenId === 'profile') {
      const p = profileColumns({ ...existing, ...toSave });
      await run(
        `UPDATE candidates SET name=?, city=?, city_other=?, whatsapp=?, email=?, role=?, seniority=? WHERE id=?`,
        p.name, p.city, p.city_other, p.whatsapp, p.email, p.role, p.seniority, id,
      );
    }
    let newBranch = cur.branch;
    if (screenId === 'diag2') {
      newBranch = String(merged['D6']) as Branch;
      await run('UPDATE candidates SET branch=?, talk_language=? WHERE id=?', newBranch, String(merged['P5'] ?? ''), id);
    }

    // Advance
    const flow = flowFor(newBranch);
    const idx = flow.indexOf(screenId);
    const nextId = idx + 1 < flow.length ? flow[idx + 1] : 'done';
    const furthest = flow.indexOf(cur.current_screen);
    const sameBranch = newBranch === cur.branch;
    // Resume pointer = furthest screen reached (editing an earlier screen does not move it backwards).
    const pointer = nextId !== 'done' && sameBranch && furthest > idx + 1 ? cur.current_screen : nextId;
    await touchCandidate(id, true);
    // The last screen finishes the form in this same transaction: the « done » marker, the end date, the status and the subject row go
    // together or not at all (a failure leaves her on the last screen, never « done » without a date). The mails go out after the commit.
    if (nextId === 'done') return { id, created, nextId, token: cur.token, finishedNow: (await finalizeCandidate(id)) === 'notify' };
    await run('UPDATE candidates SET current_screen=? WHERE id=?', pointer, id);
    return { id, created, nextId, token: cur.token, finishedNow: false };
  });

  const fresh = (await getCandidate(result.id))!;
  if (result.created && fresh.email) {
    const m = candidateStarted({ name: fresh.name ?? '' }, `${appUrl()}/reprendre/${fresh.token}`, fresh.locale);
    deferMail(() => sendMail({ ...m, to: fresh.email!, kind: 'candidate_started', candidateId: fresh.id }));
  }
  if (result.finishedNow) deferMail(() => notifyCompletion(fresh.id)); // after the response: the candidate never waits on email
  return { ok: true, token: result.token, next: result.nextId, created: result.created, completed: result.nextId === 'done' };
}

/**
 * The database part of finishing the form, for a transaction that is already open (or opened by completeDiagnostic): the completion is
 * claimed in one statement (of two simultaneous submissions only one changes the row, so the subject row and the mails are never doubled),
 * then the status and the subject row are written. Returns whether this call finished it. `completedAt` (a UTC timestamp) dates a dossier
 * finished late by the recovery with the moment she sent it, not the moment it was recovered.
 */
export async function finalizeCandidate(id: number, completedAt: string | null = null): Promise<'notify' | 'quiet' | false> {
  const c = (await getCandidate(id))!;
  if (c.completed_at) return false;
  const a = await getAnswers(id);
  const won = await run(`UPDATE candidates SET completed_at=COALESCE(?::timestamp, now() at time zone 'utc'), current_screen='done' WHERE id=? AND completed_at IS NULL`, completedAt, id);
  if (won === 0) return false;
  // A recovery can reach a dossier the team has already dealt with (set aside, say): it is finished, but its status and the mails are left alone.
  const quiet = completedAt !== null && c.status !== 'en_cours';
  if (!quiet) await setStatus(id, 'diagnostic_recu', 'système');
  const fmt = a['D4'] && a['D4'] !== 'ouverte' ? String(a['D4']) : null;
  if (c.branch === 'A' || c.branch === 'B') {
    // no track is made here: the coach gives her orientations first, then generates them (templates or AI) from the fiche
    await run('INSERT INTO subjects (candidate_id,audience,format) VALUES (?,?,?) ON CONFLICT DO NOTHING', id, c.branch === 'B' ? String(a['B3'] ?? '') : null, fmt);
  } else if (c.branch === 'C') {
    await run(
      `INSERT INTO subjects (candidate_id,title,abstract,audience,format) VALUES (?,?,?,?,?)
       ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format`,
      id, String(a['C1'] ?? ''), String(a['C-abstract'] ?? ''), String(a['C2'] ?? ''), fmt,
    );
  } else if (c.branch === 'D') {
    await run(
      `INSERT INTO subjects (candidate_id,title,abstract,audience,format,application_state) VALUES (?,?,?,?,?,?)
       ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format, application_state=excluded.application_state`,
      id, String(a['D1-a'] ?? ''), String(a['D1-b'] ?? ''), String(a['D1-c'] ?? ''), fmt, String(a['D1-d'] ?? 'a_soumettre'),
    );
  }
  return quiet ? 'quiet' : 'notify';
}

/** Finish the form of a dossier that is not finished (the recovery): the same steps as the last screen, mails included. */
export async function completeDiagnostic(id: number, completedAt: string | null = null) {
  if ((await tx(() => finalizeCandidate(id, completedAt))) === 'notify') deferMail(() => notifyCompletion(id));
}

/** A dossier whose last screen was recorded (« done » marker) without its end date: left so by the former two-step finish. */
export const isStuck = (c: Pick<Candidate, 'current_screen' | 'completed_at'>) => c.current_screen === 'done' && !c.completed_at;

/**
 * Finish a stuck dossier when someone opens it, before answering, so she lands on the confirmation and not on screen 1. The end date is
 * the moment she sent the last page (her last activity), so the closing date does not apply to her: she sent it in time.
 */
export async function healStuck(c: Candidate): Promise<Candidate> {
  if (!isStuck(c)) return c;
  try {
    await completeDiagnostic(c.id, c.last_activity_at);
  } catch (e) {
    // opening her link must not fail because the recovery did (a slow database is what stuck the dossier): the next opening tries again
    console.error('[heal] could not finish dossier', c.id, e);
    return c;
  }
  return (await getCandidate(c.id)) ?? c;
}

export async function coachRecipients(c: Candidate): Promise<{ name: string; email: string }[]> {
  const out = new Map<string, string>();
  const coach = await getCoach(c.coach_id);
  if (coach?.active) out.set(coach.email.toLowerCase(), coach.name);
  const extra = (await getSetting('notification_email')).trim();
  for (const e of extra.split(/[,;\s]+/).filter(Boolean)) if (!out.has(e.toLowerCase())) out.set(e.toLowerCase(), 'SheSpeaks');
  return [...out].map(([email, name]) => ({ name, email }));
}

async function notifyCompletion(id: number) {
  const c = (await getCandidate(id))!;
  const a = await getAnswers(id);
  const sub = await getSubject(id);
  const jobs: Promise<unknown>[] = [];
  // candidate: confirmation of reception
  if (c.email) {
    const m = candidateConfirmation({ name: c.name ?? '' }, `${appUrl()}/reprendre/${c.token}`, c.locale);
    jobs.push(sendMail({ ...m, to: c.email, kind: 'candidate_confirmation', candidateId: id }));
  }
  // coach(es) / admin: new diagnostic, with direct link to the fiche
  const m = coachNewDiagnostic(
    {
      name: c.name ?? '', eventLabel: await eventLabelFor(c), branchLabel: c.branch ? BRANCH_LABEL[c.branch] : '—',
      whatsapp: c.whatsapp ?? '', email: c.email, subject: sub?.title || String(a['C1'] ?? a['D1-a'] ?? '') || null,
    },
    `${appUrl()}/admin/candidates/${id}`,
  );
  for (const r of await coachRecipients(c)) jobs.push(sendMail({ ...m, to: r.email, kind: 'coach_new_diagnostic', candidateId: id }));
  await Promise.allSettled(jobs); // sendMail never throws; Resend sends are serialised by the queue in mail.ts
}

/**
 * Regenerate the template proposals (coach action). Only the proposals nobody has acted on are replaced: the coach's own tracks,
 * the chosen one, the shortlisted ones and the ones she set aside all stay (a set-aside title is not proposed again).
 * Suggestions made by the AI are not touched here.
 */
export async function regenerateTracks(id: number) {
  const c = await getCandidate(id);
  if (!c || (c.branch !== 'A' && c.branch !== 'B')) return;
  const a = await getAnswers(id);
  await run(`DELETE FROM tracks WHERE candidate_id=? AND state='generee' AND origin IN ('personnelle','croisement')`, id);
  const kept = await getTracks(id);
  const have = new Set(kept.map((t) => t.title.toLowerCase()));
  const inPlay = kept.filter((t) => (t.origin === 'personnelle' || t.origin === 'croisement') && t.state !== 'ecartee').length;
  // ask for more than five: the ones the coach already handled are filtered out, and the rest must still make five in play
  const gen = generateTracks(a, c.branch, c.locale, await getRefs(), 2026, 5 + kept.length).filter((t) => !have.has(t.title.toLowerCase()));
  const base = kept.reduce((max, t) => Math.max(max, t.position + 1), 0);
  let i = 0;
  for (const t of gen.slice(0, Math.max(0, 5 - inPlay))) {
    await run('INSERT INTO tracks (candidate_id,title,angle,format,domain,hook,origin,position) VALUES (?,?,?,?,?,?,?,?)', id, t.title, t.angle, t.format, t.domain, t.hook ?? null, t.origin, base + i++);
  }
}
