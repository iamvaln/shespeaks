// Plan de route: badge, next action, 5 steps with personalised (★) actions (spec: "Écran final").
import { typoFr } from './text.ts';
import { APPLICATION_STATES, FORMATS, labelOf, type Answers, type Branch, type Locale } from './questions.ts';

export interface DevfestEvent {
  city: string; // slug, also the value stored in candidates.city
  name: string; // city / place
  title: string | null; // public name of the event, e.g. "DevFest Douala 2026"
  poster_url: string | null;
  cfp_close_date: string | null; // YYYY-MM-DD
  cfp_close_note: string | null;
  event_date: string | null;
  venue: string | null;
  submission_url: string | null;
  submission_label: string | null;
  theme?: string | null; // theme of the edition, e.g. « Stand Alone Complex »
  description?: string | null;
  accepted_formats?: string | null; // comma-separated: talk, lightning, atelier (empty = not stated)
  themes?: string | null; // comma-separated ids of the domains referential (empty = not stated)
}

export interface RoadmapAction {
  text: string;
  personalized: boolean;
}
export interface RoadmapStep {
  n: 1 | 2 | 3 | 4 | 5;
  key: string;
  title: string;
  done: boolean;
  actions: RoadmapAction[];
}
export interface Roadmap {
  badge: { name: string; devfest: string; title: string; role: string; format: string };
  nextAction: string;
  steps: RoadmapStep[];
  calendar: { pending: boolean; event: DevfestEvent | null };
}

export interface RoadmapInput {
  answers: Answers;
  branch: Branch;
  locale: Locale;
  subjectTitle?: string | null;
  event: DevfestEvent | null;
  /** display name of the event the candidate chose (also used when it is not in the calendar) */
  eventName: string;
}

type T = { fr: string; en: string };
const t = (fr: string, en: string): T => ({ fr: typoFr(fr), en });

const STEP_TITLES: T[] = [
  t('Sujet et candidature', 'Topic and application'),
  t('Préparation', 'Preparation'),
  t('Slides', 'Slides'),
  t('Répétition', 'Speech rehearsal'),
  t('Jour J', 'Talk day'),
];

const COMMON: T[][] = [
  [
    t('Valider le sujet avec l’équipe SheSpeaks', 'Validate your topic with the SheSpeaks team'),
    t('Finaliser titre et résumé', 'Finalise title and abstract'),
    t('Préparer ta bio', 'Prepare your bio'),
    t('Ajouter ta photo de speaker (plus bas sur cette page)', 'Add your speaker photo (further down this page)'),
    t('Soumettre à l’appel à speakers de ton événement avant la date limite', 'Submit to your event’s call for speakers before the deadline'),
  ],
  [
    t('Construire le plan du talk en trois parties', 'Build your talk outline in three parts'),
    t('Rassembler exemples, chiffres et démos', 'Gather examples, figures and demos'),
    t('Caler le timing section par section', 'Time each section'),
  ],
  [
    t('Une idée par slide, peu de texte, visuels lisibles de loin', 'One idea per slide, little text, visuals readable from afar'),
    t('Revue avec l’équipe SheSpeaks', 'Review with the SheSpeaks team'),
    t('Version finale une semaine avant l’événement', 'Final version one week before the event'),
  ],
  [
    t('Présentation complète et chronométrée devant le groupe', 'Full, timed presentation in front of the group'),
    t('Retours et derniers ajustements', 'Feedback and final tweaks'),
    t('Réponses préparées aux questions probables', 'Prepared answers to likely questions'),
  ],
  [
    t('Arriver tôt et tester le matériel', 'Arrive early and test the equipment'),
    t('Slides en local et sur clé USB', 'Slides stored locally and on a USB drive'),
    t('Le groupe est dans la salle pour t’encourager', 'The group is in the room to cheer you on'),
  ],
];

const NEXT: Record<string, T> = {
  AB: t(
    'L’équipe SheSpeaks, notifiée automatiquement, revient vers toi avec une sélection de pistes ; vous choisissez le sujet et rédigez le résumé ensemble.',
    'The SheSpeaks team, notified automatically, comes back to you with a selection of topic ideas; together you choose the topic and write the abstract.',
  ),
  C: t('Retravaille ton premier jet de résumé ; l’équipe SheSpeaks le relira lors de votre premier échange.', 'Rework your first draft abstract; the SheSpeaks team will review it in your first conversation.'),
  D_a_soumettre: t('Corrige les points à revoir ; l’équipe SheSpeaks fait une dernière relecture avant soumission.', 'Fix the points to review; the SheSpeaks team does a final read-through before submission.'),
  D_soumise: t('Démarre la préparation du talk avec l’équipe SheSpeaks pendant que les organisateurs décident.', 'Start preparing your talk with the SheSpeaks team while the organisers decide.'),
  D_retenue: t('Félicitations : on attaque directement la préparation avec l’équipe SheSpeaks.', 'Congratulations: we jump straight into preparation with the SheSpeaks team.'),
};

export function nextActionKey(branch: Branch, appState?: string): string {
  if (branch === 'A' || branch === 'B') return 'AB';
  if (branch === 'C') return 'C';
  if (appState === 'retenue') return 'D_retenue';
  if (appState === 'soumise') return 'D_soumise';
  return 'D_a_soumettre';
}

export function buildRoadmap(i: RoadmapInput): Roadmap {
  const { answers: a, branch, locale: loc } = i;
  const has = (code: string, v: string) => Array.isArray(a[code]) && (a[code] as string[]).includes(v);
  const appState = branch === 'D' ? String(a['D1-d'] ?? 'a_soumettre') : 'a_soumettre';
  const submitted = appState === 'soumise' || appState === 'retenue';
  const d2 = Number(a['D2'] ?? 5);

  const extra: Record<number, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  if (has('D3', 'legitime')) extra[1].push(t('Lister trois situations où tu as aidé quelqu’un à résoudre un problème', 'List three situations where you helped someone solve a problem'));
  if (has('D3', 'candidature') && !submitted) extra[1].push(t('Relecture de ta candidature par l’équipe SheSpeaks avant envoi', 'The SheSpeaks team reviews your application before you send it'));
  if (has('D3', 'temps') || a['D5'] === 'lt1' || a['D5'] === '1-2') extra[2].push(t('Bloquer deux créneaux fixes par semaine', 'Block two fixed slots per week'));
  if (a['D4'] === 'atelier') extra[2].push(t('Préparer les prérequis participants et un environnement prêt à l’emploi', 'Prepare participant prerequisites and a ready-to-use environment'));
  if (has('D3', 'slides')) extra[3].push(t('Partir d’un modèle sobre et d’un plan de tes slides dessiné sur papier', 'Start from a clean template and a paper sketch of your slides (storyboard)'));
  if (has('D3', 'anglais') || a['P5'] === 'en') extra[3].push(t('Relecture en anglais des slides et du script', 'English proofreading of the slides and script'));
  if (has('D3', 'trac') || d2 <= 2) extra[4].push(t('Te filmer en répétition', 'Film yourself while rehearsing'), t('Présenter ton sujet en 2 minutes devant trois proches', 'Present your topic in 2 minutes to three people close to you'));
  if (a['D1'] === 'premiere') extra[4].push(t('Une répétition supplémentaire en conditions réelles (debout, micro, projecteur)', 'One extra rehearsal in real conditions (standing, mic, projector)'));
  if (has('D3', 'trac')) extra[5].push(t('Routine de respiration de 3 minutes avant de monter sur scène', 'A 3-minute breathing routine before going on stage'));

  const steps: RoadmapStep[] = STEP_TITLES.map((title, idx) => {
    const n = (idx + 1) as RoadmapStep['n'];
    return {
      n,
      key: ['topic', 'prep', 'slides', 'rehearsal', 'dayd'][idx],
      title: title[loc],
      done: n === 1 && submitted,
      actions: [
        ...COMMON[idx].map((x) => ({ text: x[loc], personalized: false })),
        ...extra[n].map((x) => ({ text: x[loc], personalized: true })),
      ],
    };
  });

  const eventLabel = i.event ? i.event.title?.trim() || i.event.name : i.eventName;
  const title =
    (i.subjectTitle && i.subjectTitle.trim()) ||
    String(a['C1'] ?? a['D1-a'] ?? '').trim() ||
    (loc === 'fr' ? 'à définir' : 'to be defined');

  return {
    badge: {
      name: String(a['P1'] ?? ''),
      devfest: eventLabel,
      title,
      role: String(a['P6'] ?? ''),
      format: labelOf(FORMATS, String(a['D4'] ?? ''), loc),
    },
    nextAction: NEXT[nextActionKey(branch, appState)][loc],
    steps,
    calendar: { pending: !i.event || (!i.event.cfp_close_date && !i.event.event_date), event: i.event },
  };
}

export { APPLICATION_STATES };
