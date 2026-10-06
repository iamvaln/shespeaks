'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearSession, consumeLoginToken, inviteCoach, requestLogin, requireCoach, setSession } from '@/lib/auth';
import { all, get, insert, run, setSetting, STATUSES, type SettingKey } from '@/lib/db';
import { getSubject, getTracks, setStatus, touchCandidate, type Coach } from '@/lib/data';
import { regenerateTracks } from '@/lib/diagnostic';
import { removeObject } from '@/lib/storage';
import { sendReminderNow } from '@/lib/reminders';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => Number(f.get(k));
const back = (path: string, msg?: string, err = false): never => redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'msg'}=${encodeURIComponent(msg)}` : path);

// ---- auth ----------------------------------------------------------------------
export async function loginAction(_: unknown, f: FormData): Promise<{ sent: boolean; devLink?: string }> {
  const r = await requestLogin(str(f, 'email'));
  return { sent: true, devLink: r.devLink };
}
export async function verifyAction(f: FormData) {
  const coach = await consumeLoginToken(str(f, 'token'));
  if (!coach) redirect('/admin/login?expired=1');
  await setSession(coach!.id);
  redirect('/admin');
}
export async function logoutAction() {
  await clearSession();
  redirect('/admin/login');
}

// ---- candidate ---------------------------------------------------------------
const cpath = (id: number) => `/admin/candidates/${id}`;

export async function changeStatusAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'id');
  const status = str(f, 'status');
  if (!STATUSES.some((s) => s.id === status)) return back(cpath(id), 'Statut inconnu', true);
  if (status === 'sujet_valide') {
    const s = await getSubject(id);
    if (!s?.title?.trim() || !s?.abstract?.trim()) return back(cpath(id), 'Pour valider le sujet, renseigne d’abord le titre et le résumé du sujet retenu.', true);
  }
  await setStatus(id, status, coach.name);
  revalidatePath('/admin', 'layout');
  return back(cpath(id), 'Statut mis à jour');
}

export async function assignCoachAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  await run('UPDATE candidates SET coach_id=? WHERE id=?', num(f, 'coach_id') || null, id);
  return back(cpath(id), 'Coach assignée');
}

export async function addNoteAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'id');
  const text = str(f, 'text');
  const next = str(f, 'next_point_date') || null;
  if (!text && !next) return back(cpath(id), 'Écris une note ou fixe une date', true);
  await run('INSERT INTO notes (candidate_id,coach_id,text,next_point_date) VALUES (?,?,?,?)', id, coach.id, text || '(prochain point fixé)', next);
  if (next) await run('UPDATE candidates SET next_point_date=? WHERE id=?', next, id);
  await touchCandidate(id);
  return back(cpath(id), 'Note ajoutée');
}

export async function setNextPointAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  await run('UPDATE candidates SET next_point_date=? WHERE id=?', str(f, 'next_point_date') || null, id);
  return back(cpath(id), 'Prochain point enregistré');
}

export async function saveSubjectAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  await run(
    `INSERT INTO subjects (candidate_id,title,abstract,audience,format,application_state) VALUES (?,?,?,?,?,?)
     ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format, application_state=excluded.application_state`,
    id, str(f, 'title'), str(f, 'abstract'), str(f, 'audience') || null, str(f, 'format') || null, str(f, 'application_state') || 'a_soumettre',
  );
  return back(cpath(id), 'Sujet enregistré');
}

export async function trackAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  const op = str(f, 'op');
  const tid = num(f, 'track_id');
  const track = (await getTracks(id)).find((t) => t.id === tid);
  if (op === 'add') {
    const title = str(f, 'title');
    if (!title) return back(cpath(id), 'Titre requis', true);
    await run(`INSERT INTO tracks (candidate_id,title,format,origin,position) VALUES (?,?,?,'coach',?)`, id, title, str(f, 'format') || 'talk', (await getTracks(id)).length);
    return back(cpath(id), 'Piste ajoutée');
  }
  if (op === 'regenerate') {
    await regenerateTracks(id);
    return back(cpath(id), 'Pistes régénérées');
  }
  if (!track) return back(cpath(id), 'Piste introuvable', true);
  if (op === 'save') await run('UPDATE tracks SET title=?, format=? WHERE id=?', str(f, 'title') || track.title, str(f, 'format') || track.format, tid);
  else if (op === 'discard') await run(`UPDATE tracks SET state='ecartee' WHERE id=?`, tid);
  else if (op === 'restore') await run(`UPDATE tracks SET state='generee' WHERE id=?`, tid);
  else if (op === 'shortlist') await run(`UPDATE tracks SET state='retenue_coach' WHERE id=?`, tid);
  else if (op === 'choose') {
    await run(`UPDATE tracks SET state='generee' WHERE candidate_id=? AND state='choisie'`, id);
    await run(`UPDATE tracks SET state='choisie' WHERE id=?`, tid);
    // the chosen track becomes the candidate's subject
    await run(
      `INSERT INTO subjects (candidate_id,title,format) VALUES (?,?,?)
       ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, format=COALESCE(excluded.format, subjects.format)`,
      id, track.title, track.format,
    );
  } else if (op === 'delete') await run('DELETE FROM tracks WHERE id=?', tid);
  return back(cpath(id));
}

export async function selectPhotoAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  await run('UPDATE candidates SET selected_photo_id=? WHERE id=?', num(f, 'photo_id') || null, id);
  return back(cpath(id), 'Photo retenue enregistrée');
}

export async function remindNowAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  const ok = await sendReminderNow(id);
  return back(cpath(id), ok ? 'Rappel envoyé par email' : 'Impossible : pas d’email ou diagnostic déjà terminé', !ok);
}

export async function deleteCandidateAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  if (str(f, 'confirm') !== 'SUPPRIMER') return back(cpath(id), 'Tape SUPPRIMER pour confirmer', true);
  for (const p of await all<{ filename: string }>('SELECT filename FROM photos WHERE candidate_id=?', id)) await removeObject(p.filename);
  await run('DELETE FROM candidates WHERE id=?', id);
  return back('/admin/candidates', 'Candidate supprimée');
}

// ---- events ----------------------------------------------------------------------
export async function saveEventAction(f: FormData) {
  await requireCoach();
  const nz = (k: string) => str(f, k) || null;
  const id = num(f, 'id');
  if (id) {
    await run(
      'UPDATE devfest_events SET name=?, cfp_close_date=?, cfp_close_note=?, event_date=?, venue=?, submission_url=?, submission_label=? WHERE id=?',
      str(f, 'name'), nz('cfp_close_date'), nz('cfp_close_note'), nz('event_date'), nz('venue'), nz('submission_url'), nz('submission_label'), id,
    );
    return back('/admin/events', 'Calendrier mis à jour');
  }
  const name = str(f, 'name');
  if (!name) return back('/admin/events', 'Nom de la ville requis', true);
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (await get('SELECT 1 FROM devfest_events WHERE city=?', slug)) return back('/admin/events', 'Cette ville existe déjà', true);
  await run('INSERT INTO devfest_events (city,name,cfp_close_date,cfp_close_note,event_date,venue,submission_url,submission_label) VALUES (?,?,?,?,?,?,?,?)',
    slug, name, nz('cfp_close_date'), nz('cfp_close_note'), nz('event_date'), nz('venue'), nz('submission_url'), nz('submission_label'));
  return back('/admin/events', 'Ville ajoutée');
}

// ---- coaches -----------------------------------------------------------------------
export async function inviteCoachAction(f: FormData) {
  const me = await requireCoach();
  const email = str(f, 'email').toLowerCase();
  const name = str(f, 'name');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return back('/admin/coaches', 'Nom et email valides requis', true);
  if (await get('SELECT 1 FROM coaches WHERE email=?', email)) return back('/admin/coaches', 'Cet email est déjà enregistré', true);
  const newId = await insert('INSERT INTO coaches (name,email,whatsapp) VALUES (?,?,?)', name, email, str(f, 'whatsapp') || null);
  const coach = (await get<Coach>('SELECT * FROM coaches WHERE id=?', newId))!;
  await inviteCoach(coach, me.name);
  return back('/admin/coaches', `Invitation envoyée à ${email}`);
}
export async function toggleCoachAction(f: FormData) {
  const me = await requireCoach();
  const id = num(f, 'id');
  if (id === me.id) return back('/admin/coaches', 'Tu ne peux pas désactiver ton propre accès', true);
  await run('UPDATE coaches SET active = 1 - active WHERE id=?', id);
  return back('/admin/coaches', 'Accès mis à jour');
}

// ---- settings ----------------------------------------------------------------------
export async function saveSettingsAction(f: FormData) {
  await requireCoach();
  const keys: SettingKey[] = ['notification_email', 'internal_deadline', 'reminder_first_hours', 'reminder_interval_hours', 'reminder_max', 'domains', 'angles'];
  for (const k of keys) await setSetting(k, str(f, k));
  await setSetting('show_tracks_to_candidates', f.get('show_tracks_to_candidates') ? 'true' : 'false');
  await setSetting('reminders_enabled', f.get('reminders_enabled') ? 'true' : 'false');
  return back('/admin/settings', 'Réglages enregistrés');
}
