// Email sending via Resend (https://resend.com), or logged-only when RESEND_API_KEY is not set, + bilingual templates.
import { logText } from './maillog.ts';
import crypto from 'node:crypto';
import { after } from 'next/server.js';
import { run } from './db.ts';
import { resolveAppUrl } from './env.ts';
import { typoFr } from './text.ts';
import type { Locale } from './questions.ts';

export const appUrl = () => resolveAppUrl(process.env).url;
const API = () => (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/$/, '');
// MAIL_FROM must be an address on a domain verified in Resend (e.g. "SheSpeaks <no-reply@mail.yourdomain.com>").
const FROM = () => process.env.MAIL_FROM || 'SheSpeaks <onboarding@resend.dev>';
export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: string;
  candidateId?: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resend's default limit is 2 requests/second. All sends of this server instance go through one queue,
// spaced out, so a burst (confirmation + coach notifications + digest) never trips 429.
// (Kept on globalThis: Next bundles each route separately, so a module-level variable would not be shared.)
const gq = globalThis as unknown as { __ssMailChain?: Promise<unknown> };
const gap = () => Number(process.env.RESEND_MIN_GAP_MS ?? 550);
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const result = (gq.__ssMailChain ?? Promise.resolve()).then(fn);
  gq.__ssMailChain = result.then(() => sleep(gap()), () => sleep(gap()));
  return result;
}

interface Delivered { id: string | null }

/** POST /emails with retries on 429 / 5xx / network errors. The idempotency key makes retries safe (no duplicate mail). */
async function resendSend(m: Mail): Promise<Delivered> {
  const key = crypto.randomUUID();
  const replyTo = process.env.MAIL_REPLY_TO?.trim();
  const body = JSON.stringify({ from: FROM(), to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) });
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API()}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok) return { id: json.id ?? null };
      lastError = `${res.status} ${json.name ?? ''} ${json.message ?? ''}`.trim();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === 3) break;
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000 * attempt);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt === 3) break;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(lastError);
}

/** Never throws: a mail failure must not break a candidate's journey. Always recorded in email_log. */
export async function sendMail(m: Mail): Promise<'sent' | 'logged' | 'failed'> {
  let status: 'sent' | 'logged' | 'failed' = 'logged';
  let error: string | null = null;
  let providerId: string | null = null;
  if (mailConfigured()) {
    try {
      providerId = (await queued(() => resendSend(m))).id;
      status = 'sent';
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
      console.error('[mail] failed', m.kind, m.to, error);
    }
  } else {
    console.log(`[mail:logged] ${m.kind} → ${m.to}\n  ${m.subject}\n  ${logText(m).split('\n').join('\n  ')}`);
  }
  try {
    await run('INSERT INTO email_log (kind,to_addr,subject,body_text,status,error,candidate_id,provider_id) VALUES (?,?,?,?,?,?,?,?)', m.kind, m.to, m.subject, logText(m), status, error, m.candidateId ?? null, providerId);
  } catch (e) {
    console.error('[mail] could not write email_log', e);
  }
  return status;
}

/** Run email work after the HTTP response has been sent (Vercel keeps the function alive via waitUntil). */
export function deferMail(job: () => Promise<unknown>) {
  try {
    after(job);
  } catch {
    void job().catch((e) => console.error('[mail] deferred job failed', e)); // outside a request (scripts)
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Layout {
  heading: string;
  paragraphs: string[]; // plain text; escaped here
  facts?: [string, string][];
  cta?: { label: string; url: string };
  footer?: string;
}

function render(l0: Layout): { html: string; text: string } {
  const l: Layout = { ...l0, heading: typoFr(l0.heading), paragraphs: l0.paragraphs.map(typoFr), facts: l0.facts?.map(([k, v]) => [typoFr(k), v] as [string, string]) };
  const logo = `${appUrl()}/brand/shespeaks-logo-nuit.png`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F3F7;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;color:#111528">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3F7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #D9D7E2">
<tr><td style="background:#111528;padding:22px 28px"><img src="${logo}" alt="SheSpeaks by Techies Connect'" height="44" style="display:block;height:44px;width:auto"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:800">${esc(l.heading)}</h1>
${l.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:24px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
${
  l.facts
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;width:100%;border-top:1px solid #D9D7E2">${l.facts
        .map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #D9D7E2;font-size:13px;color:#4F5570;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #D9D7E2;font-size:15px">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : ''
}
${l.cta ? `<p style="margin:22px 0 8px"><a href="${esc(l.cta.url)}" style="display:inline-block;background:#F5A524;color:#111528;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:16px">${esc(l.cta.label)}</a></p><p style="margin:0 0 6px;font-size:12px;color:#4F5570;word-break:break-all">${esc(l.cta.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #D9D7E2;font-size:12px;color:#4F5570;letter-spacing:.12em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace">${esc(l.footer ?? "SheSpeaks by Techies Connect'")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    l.heading,
    '',
    ...l.paragraphs.flatMap((p) => [p, '']),
    ...(l.facts ? [...l.facts.map(([k, v]) => `${k} : ${v}`), ''] : []),
    ...(l.cta ? [`${l.cta.label} : ${l.cta.url}`, ''] : []),
    '—',
    l.footer ?? "SheSpeaks by Techies Connect'",
  ].join('\n');
  return { html, text };
}

type Built = { subject: string; html: string; text: string };
const build = (subject: string, l: Layout): Built => ({ subject, ...render(l) });
const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';

// ---------------------------------------------------------------------------
// Candidate emails
// ---------------------------------------------------------------------------
export function candidateStarted(c: { name: string }, resumeUrl: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ton formulaire SheSpeaks est commencé', {
        heading: `Bienvenue ${first(c.name)} !`,
        paragraphs: [
          'Tes réponses sont enregistrées au fur et à mesure. Si tu t’interromps, tu pourras reprendre exactement là où tu t’es arrêtée, depuis n’importe quel appareil, avec ce lien personnel.',
          'Le parcours prend 8 à 10 minutes.',
        ],
        cta: { label: 'Reprendre mon formulaire', url: resumeUrl },
      })
    : build('Your SheSpeaks interest form has started', {
        heading: `Welcome ${first(c.name)}!`,
        paragraphs: [
          'Your answers are saved as you go. If you get interrupted, you can pick up exactly where you left off, from any device, using this personal link.',
          'The journey takes 8 to 10 minutes.',
        ],
        cta: { label: 'Resume my form', url: resumeUrl },
      });
}

export function candidateConfirmation(c: { name: string }, planUrl: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('L’équipe SheSpeaks a bien reçu ton formulaire d’intérêt', {
        heading: `C’est reçu, ${first(c.name)} !`,
        paragraphs: [
          'L’équipe SheSpeaks a bien reçu ton formulaire d’intérêt. On le relit et on revient vers toi sur WhatsApp ou par email pour la suite.',
          'Ton plan de route personnalisé est prêt : retrouve-le quand tu veux avec le lien ci-dessous.',
        ],
        cta: { label: 'Voir mon plan de route', url: planUrl },
      })
    : build('The SheSpeaks team has received your interest form', {
        heading: `Got it, ${first(c.name)}!`,
        paragraphs: [
          'The SheSpeaks team has received your interest form. We are reading it and will get back to you on WhatsApp or by email.',
          'Your personalised roadmap is ready: come back to it anytime with the link below.',
        ],
        cta: { label: 'See my roadmap', url: planUrl },
      });
}

export function candidateReminder(c: { name: string }, resumeUrl: string, loc: Locale, step: { done: number; total: number }): Built {
  return loc === 'fr'
    ? build('Il te reste peu de chose pour finir ton formulaire', {
        heading: `${first(c.name)}, ta scène t’attend`,
        paragraphs: [
          `Tu as commencé ton formulaire d’intérêt SheSpeaks (écran ${step.done} sur ${step.total}) mais tu ne l’as pas terminé. Il te reste quelques minutes : tes réponses sont déjà enregistrées.`,
          'Une fois terminé, l’équipe SheSpeaks reçoit ton dossier et tu obtiens ton plan de route personnalisé.',
        ],
        cta: { label: 'Reprendre là où je me suis arrêtée', url: resumeUrl },
      })
    : build('Just a little left to finish your interest form', {
        heading: `${first(c.name)}, your stage is waiting`,
        paragraphs: [
          `You started your SheSpeaks interest form (screen ${step.done} of ${step.total}) but haven’t finished it. It only takes a few minutes: your answers are already saved.`,
          'Once you’re done, the SheSpeaks team receives your file and you get your personalised roadmap.',
        ],
        cta: { label: 'Pick up where I left off', url: resumeUrl },
      });
}

export function candidateChoiceSent(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ta coach te propose des sujets', { heading: `${first(name)}, choisis ton sujet`, paragraphs: ['Ta coach SheSpeaks a préparé des sujets pour toi, avec pour chacun la raison pour laquelle il te correspond.', 'Choisis celui que tu préfères, ou dis-nous si aucun ne te convient : on t’en proposera d’autres.'], cta: { label: 'Voir les sujets', url } })
    : build('Your coach suggests topics for you', { heading: `${first(name)}, pick your topic`, paragraphs: ['Your SheSpeaks coach has prepared topics for you, each with why it suits you.', 'Pick your favourite, or tell us if none fits: we will suggest others.'], cta: { label: 'See the topics', url } });
}
export function candidateSubjectSent(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ton sujet ajusté est prêt : dis-nous s’il te convient', { heading: `${first(name)}, ton sujet a été ajusté`, paragraphs: ['Ta coach a retravaillé ton sujet : titre, résumé, ce qui a changé et pourquoi, et des conseils pour l’aborder sur scène.', 'Approuve-le, ou demande des changements en expliquant ce que tu souhaites.'], cta: { label: 'Voir mon sujet', url } })
    : build('Your adjusted topic is ready: tell us if it works for you', { heading: `${first(name)}, your topic has been adjusted`, paragraphs: ['Your coach reworked your topic: title, abstract, what changed and why, and tips to approach it on stage.', 'Approve it, or ask for changes and explain what you would like.'], cta: { label: 'See my topic', url } });
}
export function candidatePhotoRequested(name: string, url: string, loc: Locale, comment: string): Built {
  return loc === 'fr'
    ? build('Une nouvelle photo, s’il te plaît', { heading: `${first(name)}, encore une photo`, paragraphs: ['Ta coach te demande une nouvelle photo de speaker :', comment], cta: { label: 'Ajouter une photo', url } })
    : build('A new photo, please', { heading: `${first(name)}, one more photo`, paragraphs: ['Your coach asks for a new speaker photo:', comment], cta: { label: 'Add a photo', url } });
}
export function candidateReadyToSubmit(name: string, url: string, loc: Locale, i: { title: string; abstract: string; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null }): Built {
  const facts: [string, string][] = loc === 'fr'
    ? [['Titre', i.title], ['Résumé', i.abstract], ...(i.deadline ? [['Date limite', i.deadline]] as [string, string][] : []), ...(i.cfpUrl ? [['Où soumettre', i.cfpLabel || i.cfpUrl]] as [string, string][] : [])]
    : [['Title', i.title], ['Abstract', i.abstract], ...(i.deadline ? [['Deadline', i.deadline]] as [string, string][] : []), ...(i.cfpUrl ? [['Where to submit', i.cfpLabel || i.cfpUrl]] as [string, string][] : [])];
  return loc === 'fr'
    ? build('Tout est prêt : tu peux soumettre ta candidature', { heading: `${first(name)}, à toi de jouer`, paragraphs: ['Ton sujet est approuvé et ta photo validée. Soumets ta candidature à l’appel à speakers, puis confirme-le dans ton espace.'], facts, cta: { label: 'Ouvrir mon espace', url } })
    : build('All set: you can submit your application', { heading: `${first(name)}, over to you`, paragraphs: ['Your topic is approved and your photo validated. Submit your application to the call for speakers, then confirm it in your space.'], facts, cta: { label: 'Open my space', url } });
}
export function candidateProposalReminder(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ta coach attend ta réponse', { heading: `${first(name)}, un petit rappel`, paragraphs: ['Ta coach t’a envoyé une proposition il y a deux jours. Réponds-lui depuis ton espace pour avancer vers ta candidature.'], cta: { label: 'Voir la proposition', url } })
    : build('Your coach is waiting for your answer', { heading: `${first(name)}, a quick reminder`, paragraphs: ['Your coach sent you a proposal two days ago. Answer from your space to move towards your application.'], cta: { label: 'See the proposal', url } });
}
export function candidateAccessLinks(entries: { event: string; date: string; url: string }[], loc: Locale): Built {
  const lines = entries.map((e) => (loc === 'fr' ? `${e.event} (commencé le ${e.date}) : ${e.url}` : `${e.event} (started on ${e.date}): ${e.url}`));
  return loc === 'fr'
    ? build('Ton lien pour retrouver ton espace', { heading: 'Retrouve ton espace SheSpeaks', paragraphs: ['Voici ton lien personnel. Ne le partage pas : il ouvre ton espace sans mot de passe.', ...lines], cta: { label: 'Ouvrir mon espace', url: entries[0].url } })
    : build('Your link to get back to your space', { heading: 'Get back to your SheSpeaks space', paragraphs: ['Here is your personal link. Don’t share it: it opens your space without a password.', ...lines], cta: { label: 'Open my space', url: entries[0].url } });
}
const ANSWER_LABEL: Record<string, string> = {
  choisie: 'a choisi un sujet', aucune: 'ne retient aucun des sujets proposés', approuvee: 'approuve son sujet', changements: 'demande des changements sur son sujet',
  photo_deposee: 'a déposé une nouvelle photo', soumise: 'a soumis sa candidature',
};
/** `topic`: the title of the topic she chose, from the frozen copy of the choice (only for « choisie »). */
export function coachCandidateAnswered(c: { name: string }, what: string, comment: string | null, ficheUrl: string, topic: string | null = null): Built {
  const line = `${c.name} ${ANSWER_LABEL[what] ?? 'a répondu'}${topic ? ` : « ${topic} »` : ''}`;
  return build(line, {
    heading: line,
    paragraphs: comment ? ['Son commentaire :', comment] : ['Ouvre sa fiche pour la suite.'],
    cta: { label: 'Ouvrir la fiche', url: ficheUrl },
    footer: 'SheSpeaks · espace coach',
  });
}

// ---------------------------------------------------------------------------
// Coach / admin emails (admin space is in French)
// ---------------------------------------------------------------------------
export function coachNewDiagnostic(
  c: { name: string; eventLabel: string; branchLabel: string; whatsapp: string; email: string | null; subject?: string | null },
  ficheUrl: string,
): Built {
  return build(`Nouvel intérêt reçu : ${c.name} (${c.eventLabel})`, {
    heading: 'Un formulaire d’intérêt vient d’être soumis',
    paragraphs: ['Une candidate a terminé son parcours. Sa fiche récapitulative est prête à être relue ; reprends contact avec elle pour la suite.'],
    facts: [
      ['Candidate', c.name],
      ['Événement', c.eventLabel],
      ['Point de départ', c.branchLabel],
      ...(c.subject ? ([['Sujet', c.subject]] as [string, string][]) : []),
      ['WhatsApp', c.whatsapp],
      ...(c.email ? ([['Email', c.email]] as [string, string][]) : []),
    ],
    cta: { label: 'Ouvrir la fiche', url: ficheUrl },
    footer: 'SheSpeaks · espace coach',
  });
}


export interface StalledItem {
  name: string;
  eventLabel: string;
  whatsapp: string;
  email: string | null;
  screenLabel: string;
  hoursIdle: number;
  tier: number;
  url: string;
}
export function coachStalledDigest(recipientName: string, items: StalledItem[], proposalReminders = 0): Built {
  const n = items.length;
  return build(n === 1 ? `Relance à faire : ${items[0].name} n’a pas fini son formulaire` : `Relances à faire : ${n} candidates n’ont pas fini leur formulaire`, {
    heading: n === 1 ? 'Une candidate n’a pas terminé son formulaire' : `${n} candidates n’ont pas terminé leur formulaire`,
    paragraphs: [
      `Bonjour ${first(recipientName)}, ${n === 1 ? 'cette candidate a commencé le parcours puis s’est arrêtée' : 'ces candidates ont commencé le parcours puis se sont arrêtées'}. Un message WhatsApp personnel est souvent le meilleur coup de pouce${items.some((i) => i.email) ? (n === 1 ? ' ; un email de rappel lui a été envoyé' : ' ; un email de rappel leur a été envoyé lorsqu’elles avaient laissé une adresse') : ''}.`,
      ...items.map(
        (i) =>
          `• ${i.name} — ${i.eventLabel} — arrêtée à « ${i.screenLabel} » depuis ${i.hoursIdle < 48 ? `${i.hoursIdle} h` : `${Math.round(i.hoursIdle / 24)} jours`} (relance n° ${i.tier})\n  WhatsApp : ${i.whatsapp}${i.email ? ` · ${i.email}` : ''}\n  Fiche : ${i.url}`,
      ),
      ...(proposalReminders > 0 ? [`Propositions relancées ce matin : ${proposalReminders}`] : []),
    ],
    cta: { label: 'Voir les candidates en cours', url: `${appUrl()}/admin/candidates?status=en_cours` },
    footer: 'SheSpeaks · espace coach',
  });
}

export function coachLogin(name: string, url: string): Built {
  return build('Ton lien de connexion SheSpeaks', {
    heading: `Bonjour ${first(name)}`,
    paragraphs: ['Voici ton lien de connexion à l’espace coach. Il est valable 15 minutes et ne fonctionne qu’une fois.', 'Si tu n’as pas demandé ce lien, tu peux ignorer cet email.'],
    cta: { label: 'Me connecter', url },
    footer: 'SheSpeaks · espace coach',
  });
}

export function coachInvite(name: string, invitedBy: string, url: string): Built {
  return build('Tu es invitée à rejoindre SheSpeaks comme coach', {
    heading: `Bienvenue ${first(name)} !`,
    paragraphs: [`${invitedBy} t’invite à rejoindre l’espace coach SheSpeaks pour accompagner des candidates jusqu’au jour J.`, 'Connecte-toi avec ton adresse email grâce au lien ci-dessous (valable 15 minutes). Pour les connexions suivantes, il suffira de saisir ton email sur la page de connexion.'],
    cta: { label: 'Accéder à l’espace coach', url },
    footer: 'SheSpeaks · espace coach',
  });
}
