// Email sending via Resend (https://resend.com), or logged-only when RESEND_API_KEY is not set, + bilingual templates.
import crypto from 'node:crypto';
import { after } from 'next/server';
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
    console.log(`[mail:logged] ${m.kind} → ${m.to}\n  ${m.subject}\n  ${m.text.split('\n').join('\n  ')}`);
  }
  try {
    await run('INSERT INTO email_log (kind,to_addr,subject,body_text,status,error,candidate_id,provider_id) VALUES (?,?,?,?,?,?,?,?)', m.kind, m.to, m.subject, m.text, status, error, m.candidateId ?? null, providerId);
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
          'L’équipe SheSpeaks a bien reçu ton formulaire d’intérêt. On le relit et on revient vers toi sur WhatsApp pour la suite.',
          'Ton plan de route personnalisé est prêt : retrouve-le quand tu veux avec le lien ci-dessous.',
        ],
        cta: { label: 'Voir mon plan de route', url: planUrl },
      })
    : build('The SheSpeaks team has received your interest form', {
        heading: `Got it, ${first(c.name)}!`,
        paragraphs: [
          'The SheSpeaks team has received your interest form. We are reading it and will get back to you on WhatsApp.',
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
export function coachStalledDigest(recipientName: string, items: StalledItem[]): Built {
  const n = items.length;
  return build(n === 1 ? `Relance à faire : ${items[0].name} n’a pas fini son formulaire` : `Relances à faire : ${n} candidates n’ont pas fini leur formulaire`, {
    heading: n === 1 ? 'Une candidate n’a pas terminé son formulaire' : `${n} candidates n’ont pas terminé leur formulaire`,
    paragraphs: [
      `Bonjour ${first(recipientName)}, ces candidates ont commencé le parcours puis se sont arrêtées. Un message WhatsApp personnel est souvent le meilleur coup de pouce${items.some((i) => i.email) ? ' ; un email de rappel leur a été envoyé lorsqu’elles avaient laissé une adresse' : ''}.`,
      ...items.map(
        (i) =>
          `• ${i.name} — ${i.eventLabel} — arrêtée à « ${i.screenLabel} » depuis ${i.hoursIdle < 48 ? `${i.hoursIdle} h` : `${Math.round(i.hoursIdle / 24)} jours`} (relance n° ${i.tier})\n  WhatsApp : ${i.whatsapp}${i.email ? ` · ${i.email}` : ''}\n  Fiche : ${i.url}`,
      ),
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
