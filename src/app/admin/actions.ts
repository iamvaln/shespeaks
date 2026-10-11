'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearSession, consumeLoginToken, inviteCoach, requestLogin, requireCoach, setSession } from '@/lib/auth';
import { all, get, insert, run, setSetting, STATUSES, type SettingKey } from '@/lib/db';
import { getRefs, getSubject, getTracks, markUpdated, setStatus, type Coach } from '@/lib/data';
import { regenerateTracks } from '@/lib/diagnostic';
import { suggestTracksFor } from '@/lib/ai-tracks';
import { improveSubjectFor } from '@/lib/ai-subject-store';
import type { AiProvider } from '@/lib/ai-topics';
import { removeObject } from '@/lib/storage';
import { sendReminderNow } from '@/lib/reminders';
import { checkVerifyRate, requestIp } from '@/lib/ratelimit';
import { isEmail } from '@/lib/questions';
import { markHandled, requestPhoto, sendChoice, sendSubject, validatePhoto } from '@/lib/proposals';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => Number(f.get(k));
/** A date field must be « AAAA-MM-JJ » (what <input type="date"> sends); anything else is refused instead of being stored. */
const badDate = (v: string | null) => !!v && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)));
const oneLine = (v: string) => v.replace(/\s+/g, ' ').trim(); // a title is typed in a box that grows: no line breaks
const back = (path: string, msg?: string, err = false): never => redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}${err ? 'err' : 'msg'}=${encodeURIComponent(msg)}` : path);

// ---- auth ----------------------------------------------------------------------
export async function loginAction(_: unknown, f: FormData): Promise<{ sent: boolean; devLink?: string; retryMinutes?: number; email?: string }> {
  const email = str(f, 'email');
  const r = await requestLogin(email, requestIp(await headers()));
  if (r.retryAfterSec) return { sent: false, retryMinutes: Math.max(1, Math.ceil(r.retryAfterSec / 60)), email };
  return { sent: true, devLink: r.devLink };
}
export async function verifyAction(f: FormData) {
  if (!(await checkVerifyRate(requestIp(await headers()))).ok) redirect('/admin/login?limited=1');
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
// A fiche has tabs (?tab=…); an action sends the coach back to the tab she was on.
const TABS = ['reponses', 'notes', 'photos', 'plan'];
const cpath = (id: number, tab = '') => `/admin/candidates/${id}${TABS.includes(tab) ? `?tab=${tab}` : ''}`;

/**
 * The « Suivi » card: status, coach and next follow-up date. Only what she changed since the page was loaded (the was_* fields)
 * is saved, so a page left open never overwrites what a colleague did meanwhile; a refused status does not block the rest.
 */
export async function followUpAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'id');
  const tab = str(f, 'tab');
  const status = str(f, 'status');
  const coachId = str(f, 'coach_id');
  const date = str(f, 'next_point_date');
  if (!STATUSES.some((s) => s.id === status)) return back(cpath(id, tab), 'Statut inconnu', true);
  if (badDate(date || null)) return back(cpath(id, tab), 'Date non valide : choisis-la dans le calendrier (ou écris-la sous la forme 2026-11-15)', true);
  const changed = { status: status !== str(f, 'was_status'), coach: coachId !== str(f, 'was_coach'), date: date !== str(f, 'was_date') };
  if (!changed.status && !changed.coach && !changed.date) return back(cpath(id, tab), 'Rien n’a changé');
  let refused = '';
  if (changed.status) {
    if (status === 'sujet_valide') {
      const s = await getSubject(id);
      if (!s?.title?.trim() || !s?.abstract?.trim()) refused = 'Le statut n’a pas changé : pour valider le sujet, renseigne d’abord le titre et le résumé dans l’onglet « Sujet et pistes ».';
    }
    if (!refused) await setStatus(id, status, coach.name);
  }
  if (changed.coach) await run('UPDATE candidates SET coach_id=? WHERE id=?', coachId ? num(f, 'coach_id') : null, id);
  if (changed.date) await run('UPDATE candidates SET next_point_date=? WHERE id=?', date || null, id);
  revalidatePath('/admin', 'layout'); // the menu counts the interests to process
  if (refused) return back(cpath(id, tab), changed.coach || changed.date ? `${refused} Le reste est enregistré.` : refused, true);
  return back(cpath(id, tab), 'Suivi enregistré');
}

export async function addNoteAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'id');
  const text = str(f, 'text');
  const next = str(f, 'next_point_date') || null;
  if (badDate(next)) return back(cpath(id, 'notes'), 'Date non valide : choisis-la dans le calendrier (ou écris-la sous la forme 2026-11-15)', true);
  if (!text && !next) return back(cpath(id, 'notes'), 'Écris une note ou fixe une date', true);
  await run('INSERT INTO notes (candidate_id,coach_id,text,next_point_date) VALUES (?,?,?,?)', id, coach.id, text || '(prochain point fixé)', next);
  if (next) await run('UPDATE candidates SET next_point_date=? WHERE id=?', next, id);
  await markUpdated(id);
  return back(cpath(id, 'notes'), 'Note ajoutée');
}

export async function saveSubjectAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  await run(
    `INSERT INTO subjects (candidate_id,title,abstract,audience,format,application_state,why,plan) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format,
       application_state=excluded.application_state, why=excluded.why, plan=excluded.plan`,
    id, str(f, 'title'), str(f, 'abstract'), str(f, 'audience') || null, str(f, 'format') || null, str(f, 'application_state') || 'a_soumettre',
    str(f, 'why').slice(0, 1500) || null, str(f, 'plan').slice(0, 3000) || null,
  );
  return back(cpath(id), 'Sujet enregistré');
}

// The candidate id travels as `cid`: a field named `id` shadows form.id, and React then drops the clicked button's `op`.
const AI_MESSAGE: Record<string, string> = {
  disabled: 'Les suggestions par IA ne sont pas activées sur ce serveur (clé API manquante).',
  not_eligible: 'Les suggestions par IA sont possibles pour une candidate sans sujet précis (points de départ A et B) dont le formulaire est terminé.',
  limited: 'Limite atteinte pour aujourd’hui (par coach, ou pour cette candidate). Réessaie demain.',
  refused: 'Le modèle n’a pas pu répondre à cette demande. Les pistes existantes sont inchangées.',
  truncated: 'La réponse du modèle est restée incomplète. Réessaie dans un instant ; les pistes existantes sont inchangées.',
  empty: 'Le modèle n’a rien proposé d’utilisable. Réessaie dans un instant ; les pistes existantes sont inchangées.',
  failed: 'Le service d’IA n’a pas répondu. Réessaie dans un instant ; les pistes existantes sont inchangées.',
};

/** « Suggérer avec l'IA » on a fiche: titles written by the model, added to the tracks for the coach to read. */
export async function suggestTracksAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const provider: AiProvider = str(f, 'provider') === 'openai' ? 'openai' : 'claude';
  const name = provider === 'openai' ? 'OpenAI' : 'Claude';
  // « Précisions pour l'IA »: kept on the fiche (every next request reuses them), saved before the call so a failure keeps them too
  if (f.has('ai_brief')) await run('UPDATE candidates SET ai_brief=? WHERE id=?', str(f, 'ai_brief').slice(0, 800) || null, id);
  const r = await suggestTracksFor(id, coach.id, undefined, provider);
  if (!r.ok) return back(cpath(id), `${name} : ${AI_MESSAGE[r.reason] ?? AI_MESSAGE.failed}`, true);
  return back(cpath(id), `${r.added} nouvelle${r.added > 1 ? 's' : ''} suggestion${r.added > 1 ? 's' : ''} de ${name} (ses précédentes non retenues sont remplacées) : à relire avant d’en retenir`);
}

/** « Améliorer avec Claude / OpenAI » in « Sujet retenu »: three titles, an abstract and how to approach the talk, for the coach to read. */
export async function improveSubjectAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const provider: AiProvider = str(f, 'provider') === 'openai' ? 'openai' : 'claude';
  const name = provider === 'openai' ? 'OpenAI' : 'Claude';
  if (f.has('ai_brief')) await run('UPDATE candidates SET ai_brief=? WHERE id=?', str(f, 'ai_brief').slice(0, 800) || null, id);
  const r = await improveSubjectFor(id, coach.id, provider);
  if (!r.ok) {
    const why = r.reason === 'not_eligible' ? 'Il faut un formulaire terminé et un sujet de départ (titre ou résumé).' : AI_MESSAGE[r.reason] ?? AI_MESSAGE.failed;
    return back(cpath(id), `${name} : ${why}`, true);
  }
  return back(cpath(id), `Proposition d’amélioration de ${name} prête, sous le sujet : à relire, puis « Utiliser » ce qui te convient et enregistrer`);
}

export async function trackAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'cid');
  const op = str(f, 'op');
  const tid = num(f, 'track_id');
  const track = (await getTracks(id)).find((t) => t.id === tid);
  if (op === 'add') {
    const title = oneLine(str(f, 'title'));
    if (!title) return back(cpath(id), 'Titre requis', true);
    await run(`INSERT INTO tracks (candidate_id,title,format,origin,position) VALUES (?,?,?,'coach',?)`, id, title, str(f, 'format') || 'talk', (await getTracks(id)).length);
    return back(cpath(id), 'Piste ajoutée');
  }
  if (op === 'regenerate') {
    await regenerateTracks(id);
    return back(cpath(id), 'Pistes régénérées');
  }
  if (!track) return back(cpath(id), 'Piste introuvable', true);
  // whichever button she pressed, what she typed in the title and the format of this track is kept (and the subject follows a chosen track)
  const title = oneLine(str(f, 'title')) || track.title;
  const format = str(f, 'format') || track.format;
  if (op !== 'delete' && (title !== track.title || format !== track.format)) {
    await run('UPDATE tracks SET title=?, format=? WHERE id=?', title, format, tid);
    if (track.state === 'choisie') await run('UPDATE subjects SET title=?, format=? WHERE candidate_id=?', title, format, id);
  }
  // the sentence « for the candidate » travels in the same form as the title (only retained tracks have the field)
  if (op !== 'delete' && f.has('pitch')) await run('UPDATE tracks SET pitch=? WHERE id=?', str(f, 'pitch').slice(0, 400) || null, tid);
  let done: string;
  if (op === 'save') {
    done = 'Piste enregistrée';
  } else if (op === 'discard') {
    await run(`UPDATE tracks SET state='ecartee' WHERE id=?`, tid);
    done = 'Piste écartée';
  } else if (op === 'restore') {
    await run(`UPDATE tracks SET state='generee' WHERE id=?`, tid);
    done = 'Piste rétablie';
  } else if (op === 'shortlist') {
    await run(`UPDATE tracks SET state='retenue_coach' WHERE id=?`, tid);
    done = 'Piste retenue';
  } else if (op === 'choose') {
    await run(`UPDATE tracks SET state='generee' WHERE candidate_id=? AND state='choisie'`, id);
    await run(`UPDATE tracks SET state='choisie' WHERE id=?`, tid);
    // the chosen track becomes the candidate's subject
    await run(
      `INSERT INTO subjects (candidate_id,title,format) VALUES (?,?,?)
       ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, format=COALESCE(excluded.format, subjects.format)`,
      id, title, format,
    );
    done = 'Piste choisie : elle devient le sujet de la candidate';
  } else if (op === 'delete') {
    await run('DELETE FROM tracks WHERE id=?', tid);
    done = 'Piste supprimée';
  } else return back(cpath(id), 'Action inconnue', true);
  return back(cpath(id), done);
}

export async function selectPhotoAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  const photoId = num(f, 'photo_id') || null;
  await run('UPDATE candidates SET selected_photo_id=? WHERE id=?', photoId, id);
  return back(cpath(id, 'photos'), photoId ? 'Photo retenue' : 'Photo non retenue');
}

export async function remindNowAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'id');
  const tab = str(f, 'tab');
  const sent = await sendReminderNow(id);
  if (sent === 'sent') return back(cpath(id, tab), 'Rappel envoyé par email');
  if (sent === 'logged') return back(cpath(id, tab), 'Rappel non envoyé : l’envoi d’emails n’est pas configuré, il est seulement enregistré dans la page Emails. Écris-lui sur WhatsApp.', true);
  if (sent === 'failed') return back(cpath(id, tab), 'Le rappel n’est pas parti : l’envoi a échoué (détail dans la page Emails). Écris-lui sur WhatsApp.', true);
  return back(cpath(id, tab), 'Impossible : pas d’email ou formulaire déjà terminé', true);
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
const safePoster = (v: string) => (/^(\/[\w\-./]+|https:\/\/\S+)$/.test(v) ? v : null);

export async function saveEventAction(f: FormData) {
  await requireCoach();
  const nz = (k: string) => str(f, k) || null;
  const id = num(f, 'id');
  const title = str(f, 'title');
  const place = str(f, 'name');
  const posterRaw = str(f, 'poster_url');
  if (badDate(nz('cfp_close_date')) || badDate(nz('event_date'))) return back('/admin/events', 'Date non valide : choisis-la dans le calendrier (ou écris-la sous la forme 2026-11-15)', true);
  if (posterRaw && !safePoster(posterRaw)) return back('/admin/events', 'L’affiche doit être un chemin du site (/events/mon-affiche.jpg) ou une adresse https://', true);
  const ctx = await eventContext(f);
  if (id) {
    await run(
      'UPDATE devfest_events SET title=?, name=?, poster_url=?, cfp_close_date=?, cfp_close_note=?, event_date=?, venue=?, submission_url=?, submission_label=?, theme=?, description=?, accepted_formats=?, themes=? WHERE id=?',
      title || place, place, posterRaw || null, nz('cfp_close_date'), nz('cfp_close_note'), nz('event_date'), nz('venue'), nz('submission_url'), nz('submission_label'),
      ctx.theme, ctx.description, ctx.accepted_formats, ctx.themes, id,
    );
    return back('/admin/events', 'Événement mis à jour');
  }
  if (!title) return back('/admin/events', 'Le nom de l’événement est requis', true);
  const slug = (title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || (await get('SELECT 1 FROM devfest_events WHERE city=?', slug))) return back('/admin/events', 'Un événement portant ce nom existe déjà', true);
  await run('INSERT INTO devfest_events (city,name,title,poster_url,cfp_close_date,cfp_close_note,event_date,venue,submission_url,submission_label,theme,description,accepted_formats,themes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    slug, place || title, title, posterRaw || null, nz('cfp_close_date'), nz('cfp_close_note'), nz('event_date'), nz('venue'), nz('submission_url'), nz('submission_label'),
    ctx.theme, ctx.description, ctx.accepted_formats, ctx.themes);
  return back('/admin/events', 'Événement ajouté');
}

/** Theme, description, accepted formats and expected themes of an event: lists keep known ids only, in a stable order. */
async function eventContext(f: FormData) {
  const pick = (key: string, known: readonly string[]) => {
    const chosen = new Set(f.getAll(key).map(String));
    const ids = known.filter((v) => chosen.has(v));
    return ids.length ? ids.join(',') : null;
  };
  const domains = (await getRefs()).domains.map((d) => d.value);
  return {
    theme: str(f, 'theme').slice(0, 200) || null,
    description: str(f, 'description').slice(0, 3000) || null,
    accepted_formats: pick('accepted_formats', ['talk', 'lightning', 'atelier']),
    themes: pick('themes', domains),
  };
}

// ---- coaches -----------------------------------------------------------------------
export async function inviteCoachAction(f: FormData) {
  const me = await requireCoach();
  const email = str(f, 'email').toLowerCase();
  const name = str(f, 'name');
  if (!name || !isEmail(email)) return back('/admin/coaches', 'Nom et email valides requis', true);
  if (await get('SELECT 1 FROM coaches WHERE email=?', email)) return back('/admin/coaches', 'Cet email est déjà enregistré', true);
  const newId = await insert('INSERT INTO coaches (name,email,whatsapp) VALUES (?,?,?)', name, email, str(f, 'whatsapp') || null);
  const coach = (await get<Coach>('SELECT * FROM coaches WHERE id=?', newId))!;
  const sent = await inviteCoach(coach, me.name);
  if (sent === 'sent') return back('/admin/coaches', `Invitation envoyée à ${email}`);
  const why = sent === 'failed' ? 'l’envoi a échoué. Elle peut demander son lien depuis la page de connexion' : 'l’envoi d’emails n’est pas configuré';
  return back('/admin/coaches', `${name} est ajoutée, mais l’email d’invitation n’est pas parti (détail dans la page Emails) : ${why}.`, true);
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
  const keys: SettingKey[] = ['notification_email', 'internal_deadline', 'reminder_first_hours', 'reminder_interval_hours', 'reminder_max', 'domains', 'angles', 'topic_focus'];
  for (const k of keys) await setSetting(k, str(f, k));
  await setSetting('show_tracks_to_candidates', f.get('show_tracks_to_candidates') ? 'true' : 'false');
  await setSetting('reminders_enabled', f.get('reminders_enabled') ? 'true' : 'false');
  return back('/admin/settings', 'Réglages enregistrés');
}

// ---- exchanges with the candidate (proposals flow) -------------------------------
export async function sendChoiceAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await sendChoice(id, coach.id);
  return r.ok ? back(cpath(id), 'Choix envoyé à la candidate : elle est prévenue par email') : back(cpath(id), r.error, true);
}
export async function sendSubjectAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await sendSubject(id, coach.id);
  return r.ok ? back(cpath(id), 'Sujet envoyé à la candidate pour validation : elle est prévenue par email') : back(cpath(id), r.error, true);
}
export async function requestPhotoAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await requestPhoto(id, coach.id, str(f, 'comment'));
  return r.ok ? back(cpath(id, 'photos'), 'Nouvelle photo demandée à la candidate') : back(cpath(id, 'photos'), r.error, true);
}
export async function validatePhotoAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'cid');
  const r = await validatePhoto(id, num(f, 'photo_id'));
  return r.ok ? back(cpath(id, 'photos'), 'Photo validée') : back(cpath(id, 'photos'), r.error, true);
}
export async function markHandledAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'cid');
  await markHandled(id);
  return back(cpath(id), 'Réponse marquée comme traitée');
}
