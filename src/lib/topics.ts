// Topic-track generation (spec: "Règles de génération des pistes de sujets").
import type { Answers, Locale, Refs } from './questions.ts';
import { capitalize, textLocale, truncate } from './text.ts';

export type TrackFormat = 'talk' | 'lightning' | 'atelier';
export interface GeneratedTrack {
  title: string;
  angle: string; // angle id
  format: TrackFormat;
  domain: string; // display label
  origin: 'personnelle' | 'croisement';
  hook?: string;
}

interface AngleTemplate {
  format: TrackFormat;
  title: (d: string, year: number) => { fr: string; en: string };
}

const TEMPLATES: Record<string, AngleTemplate> = {
  retour: {
    format: 'talk',
    title: (d) => ({ fr: `Retour d’expérience : un projet ${d} de l’idée à la production`, en: `Lessons from the field: a ${d} project from idea to production` }),
  },
  demo: { format: 'atelier', title: () => ({ fr: '', en: '' }) }, // built separately (techno/domain fallback)
  decouverte: {
    format: 'talk',
    title: (d, y) => ({ fr: `${capitalize(d)} : le guide pour bien démarrer en ${y}`, en: `${capitalize(d)}: the guide to getting started in ${y}` }),
  },
  lecons: { format: 'lightning', title: (d) => ({ fr: `5 leçons apprises en ${d}`, en: `5 lessons learned in ${d}` }) },
  parcours: {
    format: 'talk',
    title: (d) => ({ fr: `Mon parcours en ${d} : les étapes qui ont tout changé`, en: `My journey in ${d}: the milestones that changed everything` }),
  },
  enjeux: {
    format: 'talk',
    title: (d) => ({ fr: `${capitalize(d)} au Cameroun : opportunités concrètes pour les builders`, en: `${capitalize(d)} in Cameroon: concrete opportunities for builders` }),
  },
};

const HOOKS = {
  case: { fr: 'Ton problème résolu devient une étude de cas : c’est ton expertise en action.', en: 'Your solved problem becomes a case study: your expertise in action.' },
  faq: { fr: 'On te sollicite déjà sur ce sujet : tu as des réponses à partager.', en: 'People already come to you on this: you have answers to share.' },
  hindsight: { fr: 'Tu transmets ce que tu aurais voulu entendre à tes débuts.', en: 'You pass on what you wish you had heard when you started.' },
  cross: { fr: 'Un angle qui croise ton domaine et ton style de prise de parole.', en: 'An angle that blends your field with your speaking style.' },
};

export function firstTechno(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.split(/[,;/]|\s+et\s+|\s+and\s+/i)[0]?.trim() ?? '';
}

function crossTitle(angle: string, domain: string, techno: string, loc: Locale, year: number): string {
  if (angle === 'demo') {
    if (techno) return loc === 'fr' ? `Live demo : construire une app avec ${techno} en 25 minutes` : `Live demo: building an app with ${techno} in 25 minutes`;
    return loc === 'fr' ? `Live demo : construire un premier projet ${domain}` : `Live demo: building a first ${domain} project`;
  }
  return TEMPLATES[angle].title(domain, year)[loc];
}

/**
 * Whether a track may be shown to the candidate (when the setting is on): not the ones set aside, and not an AI suggestion that no coach
 * has read yet (it only appears once a coach shortlists or chooses it).
 */
export const shownToCandidate = (t: { state: string; origin: string }): boolean =>
  t.state !== 'ecartee' && !(t.origin === 'ia' && t.state === 'generee');

/** The domains of a candidate of branch A or B as they read in titles (a precise B2 sub-topic replaces the domain name). */
export function domainLabelsOf(a: Answers, branch: 'A' | 'B', refs: Refs, loc: Locale): string[] {
  // parenthetical detail (e.g. "(Android, Flutter, iOS)") reads badly inside a title
  const labelOfDomain = (id: string) => (refs.domains.find((d) => d.value === id)?.label[loc] ?? id).replace(/\s*\(.*?\)/g, '').trim();
  if (branch === 'A') return (Array.isArray(a['A2']) ? (a['A2'] as string[]) : []).map(labelOfDomain);
  const ids = typeof a['B1'] === 'string' ? [a['B1'] as string] : [];
  const precise = typeof a['B2'] === 'string' ? a['B2'].trim() : '';
  return ids.map((id) => precise || labelOfDomain(id)); // B2 replaces the domain name
}

export function generateTracks(
  a: Answers,
  branch: 'A' | 'B',
  uiLocale: Locale,
  refs: Refs,
  year = 2026,
  limit = 5,
): GeneratedTrack[] {
  const loc = textLocale(a['P5'], uiLocale);
  // Domains in order, and the label used in titles.
  const domainLabels = domainLabelsOf(a, branch, refs, loc);
  const angleIds = ((branch === 'A' ? a['A7'] : a['B4']) as string[] | undefined) ?? [];
  const techno = firstTechno(a['A3']);

  const out: GeneratedTrack[] = [];
  const seen = new Set<string>();
  const push = (t: GeneratedTrack) => {
    const key = t.title.trim().toLowerCase();
    if (!t.title.trim() || seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(t);
  };
  const firstDomain = domainLabels[0] ?? '';

  // 1. personal tracks (only if the source answer is filled)
  const story = String((branch === 'A' ? a['A4'] : a['B5']) ?? '').trim();
  if (story) {
    const pre = loc === 'fr' ? 'Cas pratique : ' : 'Case study: ';
    push({ title: pre + truncate(story, 70), angle: 'retour', format: 'talk', domain: firstDomain, origin: 'personnelle', hook: HOOKS.case[loc] });
  }
  const faq = String(a['A5'] ?? '').trim();
  if (branch === 'A' && faq) {
    const title = loc === 'fr' ? `Les questions qu’on me pose le plus sur ${faq}` : `The questions I get asked the most about ${faq}`;
    push({ title, angle: 'lecons', format: 'talk', domain: firstDomain, origin: 'personnelle', hook: HOOKS.faq[loc] });
  }
  const hindsight = String(a['A6'] ?? '').trim();
  if (branch === 'A' && hindsight) {
    const title = loc === 'fr' ? `Ce que j’aurais aimé savoir en débutant en ${firstDomain}` : `What I wish I had known when starting out in ${firstDomain}`;
    push({ title, angle: 'parcours', format: 'talk', domain: firstDomain, origin: 'personnelle', hook: HOOKS.hindsight[loc] });
  }

  // 2. domain × angle crossings: chosen angles for the first domain, then the next one
  const cross = (angle: string, domain: string) =>
    push({
      title: crossTitle(angle, domain, techno, loc, year),
      angle,
      format: TEMPLATES[angle].format,
      domain,
      origin: 'croisement',
      hook: HOOKS.cross[loc],
    });
  for (const d of domainLabels) for (const an of angleIds) if (TEMPLATES[an]) cross(an, d);

  // Safety net so the coach always gets five tracks: remaining angles on the domains.
  if (out.length < limit) {
    for (const d of domainLabels) for (const an of Object.keys(TEMPLATES)) if (!angleIds.includes(an)) cross(an, d);
  }
  return out;
}
