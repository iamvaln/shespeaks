// Email sending (SMTP via nodemailer, or logged-only when SMTP is not configured) + bilingual templates.
import nodemailer from 'nodemailer';
import { run } from './db.ts';
import type { Locale } from './questions.ts';

export const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const FROM = () => process.env.MAIL_FROM || 'SheSpeaks <no-reply@shespeaks.local>';

let transport: nodemailer.Transporter | null | undefined;
function getTransport() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;
  return transport;
}
export const mailConfigured = () => !!process.env.SMTP_HOST;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: string;
  candidateId?: number | null;
}

/** Never throws: a mail failure must not break a candidate's journey. Always recorded in email_log. */
export async function sendMail(m: Mail): Promise<'sent' | 'logged' | 'failed'> {
  let status: 'sent' | 'logged' | 'failed' = 'logged';
  let error: string | null = null;
  const tr = getTransport();
  if (tr) {
    try {
      await tr.sendMail({ from: FROM(), to: m.to, subject: m.subject, text: m.text, html: m.html });
      status = 'sent';
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
      console.error('[mail] failed', m.kind, m.to, error);
    }
  } else {
    console.log(`[mail:logged] ${m.kind} → ${m.to}\n  ${m.subject}\n  ${m.text.split('\n').join('\n  ')}`);
  }
  await run('INSERT INTO email_log (kind,to_addr,subject,body_text,status,error,candidate_id) VALUES (?,?,?,?,?,?,?)', m.kind, m.to, m.subject, m.text, status, error, m.candidateId ?? null);
  return status;
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

function render(l: Layout): { html: string; text: string } {
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
    ? build('Ton diagnostic SheSpeaks est commencé', {
        heading: `Bienvenue ${first(c.name)} !`,
        paragraphs: [
          'Tes réponses sont enregistrées au fur et à mesure. Si tu t’interromps, tu pourras reprendre exactement là où tu t’es arrêtée, depuis n’importe quel appareil, avec ce lien personnel.',
          'Le parcours prend 8 à 10 minutes.',
        ],
        cta: { label: 'Reprendre mon diagnostic', url: resumeUrl },
      })
    : build('Your SheSpeaks diagnostic has started', {
        heading: `Welcome ${first(c.name)}!`,
        paragraphs: [
          'Your answers are saved as you go. If you get interrupted, you can pick up exactly where you left off, from any device, using this personal link.',
          'The journey takes 8 to 10 minutes.',
        ],
        cta: { label: 'Resume my diagnostic', url: resumeUrl },
      });
}

export function candidateConfirmation(c: { name: string }, planUrl: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ta coach a bien reçu ton diagnostic', {
        heading: `C’est reçu, ${first(c.name)} !`,
        paragraphs: [
          'Ta coach SheSpeaks a bien reçu ton diagnostic. Elle le relit et revient vers toi très vite sur WhatsApp pour la suite.',
          'Ton plan de route personnalisé est prêt : retrouve-le quand tu veux avec le lien ci-dessous.',
        ],
        cta: { label: 'Voir mon plan de route', url: planUrl },
      })
    : build('Your coach has received your diagnostic', {
        heading: `Got it, ${first(c.name)}!`,
        paragraphs: [
          'Your SheSpeaks coach has received your diagnostic. She is reading it and will get back to you very soon on WhatsApp.',
          'Your personalised roadmap is ready: come back to it anytime with the link below.',
        ],
        cta: { label: 'See my roadmap', url: planUrl },
      });
}

export function candidateReminder(c: { name: string }, resumeUrl: string, loc: Locale, step: { done: number; total: number }): Built {
  return loc === 'fr'
    ? build('Il te reste peu de chose pour finir ton diagnostic', {
        heading: `${first(c.name)}, ta scène t’attend`,
        paragraphs: [
          `Tu as commencé ton diagnostic SheSpeaks (écran ${step.done} sur ${step.total}) mais tu ne l’as pas terminé. Il te reste quelques minutes : tes réponses sont déjà enregistrées.`,
          'Une fois terminé, ta coach reçoit ton dossier et tu obtiens ton plan de route personnalisé.',
        ],
        cta: { label: 'Reprendre là où je me suis arrêtée', url: resumeUrl },
      })
    : build('Just a little left to finish your diagnostic', {
        heading: `${first(c.name)}, your stage is waiting`,
        paragraphs: [
          `You started your SheSpeaks diagnostic (screen ${step.done} of ${step.total}) but haven’t finished it. It only takes a few minutes: your answers are already saved.`,
          'Once you’re done, your coach receives your file and you get your personalised roadmap.',
        ],
        cta: { label: 'Pick up where I left off', url: resumeUrl },
      });
}

// ---------------------------------------------------------------------------
// Coach / admin emails (admin space is in French)
// ---------------------------------------------------------------------------
export function coachNewDiagnostic(
  c: { name: string; cityLabel: string; branchLabel: string; whatsapp: string; email: string | null; subject?: string | null },
  ficheUrl: string,
): Built {
  return build(`Nouveau diagnostic reçu : ${c.name} (${c.cityLabel})`, {
    heading: 'Un diagnostic vient d’être terminé',
    paragraphs: ['Une candidate a terminé son parcours. Sa fiche récapitulative est prête à être relue ; reprends contact avec elle pour la suite.'],
    facts: [
      ['Candidate', c.name],
      ['Ville', c.cityLabel],
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
  cityLabel: string;
  whatsapp: string;
  email: string | null;
  screenLabel: string;
  hoursIdle: number;
  tier: number;
  url: string;
}
export function coachStalledDigest(recipientName: string, items: StalledItem[]): Built {
  const n = items.length;
  return build(n === 1 ? `Relance à faire : ${items[0].name} n’a pas fini son diagnostic` : `Relances à faire : ${n} candidates n’ont pas fini leur diagnostic`, {
    heading: n === 1 ? 'Une candidate n’a pas terminé son diagnostic' : `${n} candidates n’ont pas terminé leur diagnostic`,
    paragraphs: [
      `Bonjour ${first(recipientName)}, ces candidates ont commencé le parcours puis se sont arrêtées. Un message WhatsApp personnel est souvent le meilleur coup de pouce${items.some((i) => i.email) ? ' ; un email de rappel leur a été envoyé lorsqu’elles avaient laissé une adresse' : ''}.`,
      ...items.map(
        (i) =>
          `• ${i.name} — ${i.cityLabel} — arrêtée à « ${i.screenLabel} » depuis ${i.hoursIdle < 48 ? `${i.hoursIdle} h` : `${Math.round(i.hoursIdle / 24)} jours`} (relance n° ${i.tier})\n  WhatsApp : ${i.whatsapp}${i.email ? ` · ${i.email}` : ''}\n  Fiche : ${i.url}`,
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
