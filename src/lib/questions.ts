// Interest-form definition: blocks, screens, questions, validation. Pure data + pure functions
// (no framework imports) so it can be shared by the client wizard, the API and the tests.

export type Locale = 'fr' | 'en';
export type Loc = { fr: string; en: string };
export type Branch = 'A' | 'B' | 'C' | 'D';
export type Answer = string | number | string[];
export type Answers = Record<string, Answer>;

export type QType = 'text' | 'longtext' | 'phone' | 'email' | 'single' | 'multi' | 'scale';
export interface Option {
  value: string;
  label: Loc;
}
export interface Question {
  code: string;
  type: QType;
  label: Loc;
  help?: Loc;
  placeholder?: Loc;
  /** static options, or a referential resolved at runtime */
  options?: Option[] | 'domains' | 'angles' | 'events';
  required: boolean;
  /** multi: min/max selected */
  min?: number;
  max?: number;
  maxLength?: number;
  /** scale labels */
  scaleLabels?: [Loc, Loc];
  /** Only shown when predicate is true */
  showIf?: (a: Answers) => boolean;
}

export type ScreenKind = 'form' | 'draft' | 'review';
export interface Screen {
  id: string;
  kind: ScreenKind;
  branch?: Branch;
  block: Loc;
  title: Loc;
  intro?: Loc;
  questions: Question[];
}

export interface Refs {
  domains: Option[];
  angles: Option[];
  /** events candidates can take part in (from the admin calendar) + "another event" */
  events: Option[];
}

import { typoFr } from './text.ts';
export const L = (fr: string, en: string): Loc => ({ fr: typoFr(fr), en });
const opt = (value: string, fr: string, en: string): Option => ({ value, label: L(fr, en) });

export const DEFAULT_DOMAINS: Option[] = [
  opt('web', 'Développement web', 'Web development'),
  opt('mobile', 'Mobile (Android, Flutter, iOS)', 'Mobile (Android, Flutter, iOS)'),
  opt('data-ia', 'Data & IA', 'Data & AI'),
  opt('cloud', 'Cloud & DevOps', 'Cloud & DevOps'),
  opt('cyber', 'Cybersécurité', 'Cybersecurity'),
  opt('ux', 'UX/UI Design', 'UX/UI Design'),
  opt('product', 'Product management', 'Product management'),
  opt('fintech', 'Fintech & paiements mobiles', 'Fintech & mobile payments'),
  opt('carriere', 'Carrière & leadership tech', 'Tech career & leadership'),
  opt('oss', 'Open source & communautés', 'Open source & communities'),
  opt('qa', 'Qualité & tests', 'Quality & testing'),
  opt('agents', 'Agents IA', 'AI agents'),
  opt('growth', 'Growth & marketing produit', 'Growth & product marketing'),
];

/** Angle ids are tied to title templates (see topics.ts); labels are editable in the admin. */
export const ANGLE_IDS = ['retour', 'demo', 'decouverte', 'lecons', 'parcours', 'enjeux'] as const;
export type AngleId = (typeof ANGLE_IDS)[number];
export const DEFAULT_ANGLES: Option[] = [
  opt('retour', 'Retour d’expérience', 'Lessons from experience'),
  opt('demo', 'Démo en direct', 'Live demo'),
  opt('decouverte', 'Découverte pour débutant·es', 'Discovery for beginners'),
  opt('lecons', 'Leçons apprises et bonnes pratiques', 'Lessons learned and best practices'),
  opt('parcours', 'Parcours et carrière', 'Journey and career'),
  opt('enjeux', 'Enjeux et opportunités au Cameroun', 'Challenges and opportunities in Cameroon'),
];

export const OTHER_EVENT: Option = opt('autre', 'Autre événement', 'Another event');
export const DEFAULT_REFS: Refs = { domains: DEFAULT_DOMAINS, angles: DEFAULT_ANGLES, events: [OTHER_EVENT] };

export const AUDIENCES: Option[] = [
  opt('debutant', 'Débutant·es', 'Beginners'),
  opt('intermediaire', 'Intermédiaires', 'Intermediate'),
  opt('confirme', 'Confirmé·es', 'Advanced'),
  opt('tous', 'Tout public', 'All audiences'),
];

export const FORMATS: Option[] = [
  opt('talk', 'Talk (20–30 min)', 'Talk (20–30 min)'),
  opt('lightning', 'Lightning talk (5–10 min)', 'Lightning talk (5–10 min)'),
  opt('atelier', 'Atelier pratique (codelab)', 'Hands-on workshop (codelab)'),
  opt('ouverte', 'Je suis ouverte, conseillez-moi', 'I’m open, advise me'),
];

export const APPLICATION_STATES: Option[] = [
  opt('a_soumettre', 'À soumettre', 'To submit'),
  opt('soumise', 'Déjà soumise', 'Already submitted'),
  opt('retenue', 'Déjà retenue', 'Already accepted'),
];

const isA = (a: Answers) => a['D6'] === 'A';
void isA;

const profile: Screen = {
  id: 'profile',
  kind: 'form',
  block: L('Ton profil', 'About you'),
  title: L('Faisons connaissance', 'Let’s get to know you'),
  intro: L(
    'Ces infos nous permettent de te contacter et de préparer avec toi ta prise de parole à l’événement de ton choix.',
    'This helps us reach you and prepare, with you, your talk at the event of your choice.',
  ),
  questions: [
    { code: 'P1', type: 'text', required: true, maxLength: 120, label: L('Ton nom complet', 'Your full name') },
    {
      code: 'P2',
      type: 'single',
      required: true,
      label: L('À quel événement veux-tu participer ?', 'Which event do you want to take part in?'),
      help: L('Choisis l’événement tech où tu aimerais prendre la parole.', 'Pick the tech event where you would like to speak.'),
      options: 'events',
    },
    {
      code: 'P2o',
      type: 'text',
      required: true,
      maxLength: 120,
      label: L('Quel est cet événement ?', 'Which event is it?'),
      placeholder: L('Nom de l’événement et ville', 'Event name and city'),
      showIf: (a) => a['P2'] === 'autre',
    },
    {
      code: 'P3',
      type: 'phone',
      required: true,
      label: L('Ton numéro WhatsApp', 'Your WhatsApp number'),
      help: L('Numéro mobile avec l’indicatif, ex. +237 6XX XX XX XX. C’est notre canal de suivi principal. Seule l’équipe SheSpeaks voit ton numéro et ton email.', 'Mobile number with country code, e.g. +237 6XX XX XX XX. This is our main follow-up channel. Only the SheSpeaks team can see your number and email.'),
      placeholder: L('+237 6XX XX XX XX', '+237 6XX XX XX XX'),
    },
    {
      code: 'P4',
      type: 'email',
      required: true,
      label: L('Ton email', 'Your email'),
      help: L(
        'On t’envoie la confirmation, ton plan de route et un lien pour reprendre si tu t’interromps. Utilise une adresse que tu consultes.',
        'We send you the confirmation, your roadmap and a link to resume if you get interrupted. Use an address you actually check.',
      ),
    },
    {
      code: 'P6',
      type: 'text',
      required: true,
      maxLength: 120,
      label: L('Que fais-tu dans la tech ?', 'What do you do in tech?'),
      help: L('Indique ton poste ou ta filière d’études.', 'Tell us your job or your field of study.'),
      placeholder: L('Ex. étudiante en informatique, développeuse mobile, designer UX', 'E.g. computer science student, mobile developer, UX designer'),
    },
    {
      code: 'P7',
      type: 'single',
      required: true,
      label: L('Depuis combien de temps es-tu dans la tech ?', 'How long have you been in tech?'),
      help: L('Études comprises.', 'Studies included.'),
      options: [
        opt('lt1', 'Moins d’un an', 'Less than 1 year'),
        opt('1-3', '1 an à moins de 3 ans', '1 year to under 3 years'),
        opt('3-5', '3 ans à moins de 5 ans', '3 years to under 5 years'),
        opt('5+', '5 ans ou plus', '5 years or more'),
      ],
    },
  ],
};

const diag1: Screen = {
  id: 'diag1',
  kind: 'form',
  block: L('Ton expérience', 'Your experience'),
  title: L('Ton aisance à l’oral', 'Your comfort with public speaking'),
  intro: L('Pas de bonne ou mauvaise réponse : ça nous aide à personnaliser ton accompagnement.', 'No right or wrong answers: it helps us tailor your support.'),
  questions: [
    {
      code: 'D1',
      type: 'single',
      required: true,
      label: L('Ton expérience de la prise de parole', 'Your public-speaking experience'),
      options: [
        opt('premiere', 'Ce sera ma première fois', 'This will be my first time'),
        opt('meetup', 'J’ai parlé en meetup, en cours ou en entreprise', 'I have spoken at a meetup, in class or at work'),
        opt('conference', 'J’ai déjà parlé en conférence', 'I have already spoken at a conference'),
      ],
    },
    {
      code: 'D2',
      type: 'scale',
      required: true,
      label: L('À quel point te sens-tu à l’aise à l’oral ?', 'How comfortable do you feel speaking in public?'),
      scaleLabels: [L('1 = pas du tout à l’aise', '1 = not comfortable at all'), L('5 = très à l’aise', '5 = very comfortable')],
    },
    {
      code: 'D3',
      type: 'multi',
      required: false,
      label: L('Sur quoi veux-tu le plus être accompagnée ?', 'What do you want the most support with?'),
      help: L('Plusieurs choix possibles.', 'Several choices possible.'),
      options: [
        opt('sujet', 'Trouver mon sujet', 'Finding my topic'),
        opt('legitime', 'Me sentir légitime', 'Feeling legitimate'),
        opt('trac', 'Gérer le trac', 'Handling stage fright'),
        opt('anglais', 'Présenter en anglais', 'Presenting in English'),
        opt('slides', 'Concevoir mes slides', 'Designing my slides'),
        opt('temps', 'Trouver le temps de préparer', 'Finding time to prepare'),
        opt('candidature', 'Rédiger ma candidature', 'Writing my application'),
      ],
    },
  ],
};

const diag2: Screen = {
  id: 'diag2',
  kind: 'form',
  block: L('Ton projet', 'Your project'),
  title: L('Ton projet de talk', 'Your talk project'),
  questions: [
    {
      code: 'D4',
      type: 'single',
      required: true,
      label: L('Quel format te tente ?', 'Which format appeals to you?'),
      options: FORMATS,
    },
    {
      code: 'P5',
      type: 'single',
      required: true,
      label: L('Dans quelle langue veux-tu présenter ?', 'Which language do you want to present in?'),
      options: [opt('fr', 'Français', 'French'), opt('en', 'Anglais', 'English'), opt('both', 'Les deux me vont', 'Both are fine')],
    },
    {
      code: 'D5',
      type: 'single',
      required: true,
      label: L('Combien de temps peux-tu y consacrer par semaine ?', 'How much time can you spend on it each week?'),
      options: [opt('lt1', 'Moins d’1 heure', 'Less than 1 hour'), opt('1-2', '1 à 2 heures', '1 to 2 hours'), opt('3-4', '3 à 4 heures', '3 to 4 hours'), opt('5+', '5 heures ou plus', '5 hours or more')],
    },
    {
      code: 'D6',
      type: 'single',
      required: true,
      label: L('Où en es-tu avec ton sujet ?', 'Where are you with your topic?'),
      help: L('Selon ta réponse, les écrans suivants s’adaptent.', 'Depending on your answer, the next screens adapt.'),
      options: [
        opt('A', 'Je cherche encore mon sujet', 'I’m still looking for my topic'),
        opt('B', 'J’ai un domaine qui m’intéresse, mais pas encore de sujet précis', 'I have a field I like, but no specific topic yet'),
        opt('C', 'J’ai un sujet précis, mais je ne l’ai pas encore rédigé', 'I have a specific topic, but I haven’t written it up yet'),
        opt('D', 'J’ai déjà rédigé ma proposition (titre et résumé)', 'I have already written my proposal (title and abstract)'),
      ],
    },
  ],
};

// Branch letters are internal routing: the candidate only sees "Ton sujet" (the screen title tells screens apart).
const aBlock = L('Ton sujet', 'Your topic');
const bBlock = aBlock;
const cBlock = aBlock;
const dBlock = aBlock;

const a1: Screen = {
  id: 'a1',
  kind: 'form',
  branch: 'A',
  block: aBlock,
  title: L('Ce qui t’occupe au quotidien', 'What keeps you busy every day'),
  intro: L('Réponds comme tu veux : plus tu en dis, plus nos idées de sujets seront personnelles.', 'Answer as you like: the more you share, the more personal our topic ideas will be.'),
  questions: [
    { code: 'A1', type: 'longtext', required: false, maxLength: 1500, label: L('Sur quoi travailles-tu au quotidien (job, études, projets perso) ?', 'What do you work on day to day (job, studies, personal projects)?') },
    {
      code: 'A2',
      type: 'multi',
      required: true,
      min: 1,
      max: 3,
      label: L('Quels domaines t’attirent ?', 'Which fields attract you?'),
      help: L('1 à 3 choix.', '1 to 3 choices.'),
      options: 'domains',
    },
    {
      code: 'A3',
      type: 'text',
      required: false,
      maxLength: 160,
      label: L('Les outils ou technos que tu maîtrises le mieux', 'The tools or technologies you master best'),
      placeholder: L('Ex. Flutter, Figma, Python, Firebase', 'E.g. Flutter, Figma, Python, Firebase'),
    },
  ],
};

const a2: Screen = {
  id: 'a2',
  kind: 'form',
  branch: 'A',
  block: aBlock,
  title: L('Ton expérience, tes questions', 'Your experience, your questions'),
  questions: [
    { code: 'A7', type: 'multi', required: true, min: 1, label: L('Quel style de prise de parole te ressemble ?', 'Which speaking style suits you?'), help: L('Plusieurs choix possibles.', 'Several choices possible.'), options: 'angles' },
    {
      code: 'A4',
      type: 'longtext',
      required: false,
      maxLength: 1500,
      label: L('Un problème que tu as résolu et dont tu es fière', 'A problem you solved and are proud of'),
      help: L('Même petit : un bug tenace, un projet d’école, un outil pour ton équipe.', 'Even a small one: a stubborn bug, a school project, a tool for your team.'),
    },
    { code: 'A5', type: 'text', required: false, maxLength: 160, label: L('Sur quoi te pose-t-on souvent des questions ?', 'What do people often ask you about?') },
    { code: 'A6', type: 'longtext', required: false, maxLength: 1500, label: L('Qu’aurais-tu aimé savoir à tes débuts ?', 'What do you wish you had known when you started?') },
  ],
};

const b1: Screen = {
  id: 'b1',
  kind: 'form',
  branch: 'B',
  block: bBlock,
  title: L('Ton domaine de prédilection', 'Your favourite field'),
  questions: [
    { code: 'B1', type: 'single', required: true, label: L('Ton domaine', 'Your field'), options: 'domains' },
    {
      code: 'B2',
      type: 'text',
      required: false,
      maxLength: 120,
      label: L('Précise si tu veux (sous-thème, techno…)', 'Narrow it down if you like (sub-topic, tech…)'),
      placeholder: L('Ex. accessibilité web, Jetpack Compose, LLM en local', 'E.g. web accessibility, Jetpack Compose, local LLMs'),
    },
    { code: 'B3', type: 'single', required: true, label: L('À qui s’adresse ton talk ?', 'Who is your talk for?'), options: AUDIENCES },
  ],
};

const b2: Screen = {
  id: 'b2',
  kind: 'form',
  branch: 'B',
  block: bBlock,
  title: L('Ton angle et ton vécu', 'Your angle and experience'),
  questions: [
    { code: 'B4', type: 'multi', required: true, min: 1, label: L('Quel style de prise de parole te ressemble ?', 'Which speaking style suits you?'), help: L('Plusieurs choix possibles.', 'Several choices possible.'), options: 'angles' },
    { code: 'B5', type: 'longtext', required: false, maxLength: 1500, label: L('Ton vécu dans ce domaine : un projet, une réussite, une galère', 'Your experience in this field: a project, a win, a struggle') },
  ],
};

const c1: Screen = {
  id: 'c1',
  kind: 'form',
  branch: 'C',
  block: cBlock,
  title: L('Décris ton sujet', 'Describe your topic'),
  intro: L('On en fait un premier jet de résumé que tu retravailleras avec l’équipe SheSpeaks.', 'We turn it into a first draft abstract that you will refine with the SheSpeaks team.'),
  questions: [
    { code: 'C1', type: 'text', required: true, maxLength: 160, label: L('Le titre (même provisoire)', 'The title (even a provisional one)') },
    { code: 'C2', type: 'single', required: true, label: L('À qui s’adresse ton talk ?', 'Who is your talk for?'), options: AUDIENCES },
    { code: 'C3', type: 'text', required: true, maxLength: 200, label: L('Idée clé n° 1', 'Key idea #1'), help: L('Une idée clé, c’est une chose que le public doit retenir de ton talk.', 'A key idea is one thing the audience should remember from your talk.') },
    { code: 'C4', type: 'text', required: false, maxLength: 200, label: L('Idée clé n° 2', 'Key idea #2') },
    { code: 'C5', type: 'text', required: false, maxLength: 200, label: L('Idée clé n° 3', 'Key idea #3') },
    {
      code: 'C6',
      type: 'text',
      required: true,
      maxLength: 200,
      label: L('Avec quoi le public repart-il ?', 'What does the audience take away?'),
      help: L('Complète : « Le public repart avec… » Ex. une méthode, un outil, une checklist, l’envie de se lancer.', 'Complete: “The audience leaves with…” E.g. a method, a tool, a checklist, the confidence to get started.'),
    },
  ],
};

const c2: Screen = {
  id: 'c2',
  kind: 'draft',
  branch: 'C',
  block: cBlock,
  title: L('Ton premier jet de résumé', 'Your first draft abstract'),
  intro: L('Voici un premier jet construit à partir de tes réponses. Modifie-le librement : un bon résumé fait au moins 80 mots. L’équipe SheSpeaks le relira avec toi.', 'Here is a first draft built from your answers. Edit it freely: a good abstract is at least 80 words. The SheSpeaks team will review it with you.'),
  questions: [{ code: 'C-abstract', type: 'longtext', required: true, maxLength: 3000, label: L('Résumé', 'Abstract') }],
};

const d1: Screen = {
  id: 'd1',
  kind: 'form',
  branch: 'D',
  block: dBlock,
  title: L('Ta proposition', 'Your proposal'),
  questions: [
    { code: 'D1-a', type: 'text', required: true, maxLength: 200, label: L('Le titre', 'The title'), help: L('Court et clair : 12 mots maximum.', 'Short and clear: 12 words maximum.') },
    { code: 'D1-b', type: 'longtext', required: true, maxLength: 3000, label: L('Le résumé (abstract)', 'The abstract'), help: L('Un texte de 80 à 200 mots : de quoi parle ton talk, à qui il s’adresse, ce que le public y gagne.', 'A text of 80 to 200 words: what your talk is about, who it is for, what the audience gains.') },
    { code: 'D1-c', type: 'single', required: true, label: L('À quel niveau s’adresse ton talk ?', 'What level is your talk aimed at?'), options: AUDIENCES },
    { code: 'D1-d', type: 'single', required: true, label: L('Où en est ta candidature à l’appel à speakers ?', 'Where is your application to the call for speakers?'), options: APPLICATION_STATES },
  ],
};

export const SELF_CHECKS = [
  { code: 'ideas', label: L('Deux ou trois idées clés repérables', 'Two or three identifiable key ideas'), rule: L('Auto-évaluation', 'Self-check') },
  { code: 'duration', label: L('Contenu adapté à la durée du format', 'Content fits the format length'), rule: L('Auto-évaluation', 'Self-check') },
  { code: 'bio', label: L('Bio de speaker prête', 'Speaker bio ready'), rule: L('3 lignes, écrites à la 3e personne (« Aïcha est développeuse mobile… »)', '3 lines, written in the third person (“Aïcha is a mobile developer…”)') },
  { code: 'photo', label: L('Photo de speaker prête', 'Speaker photo ready'), rule: L('Nette et récente', 'Sharp and recent') },
] as const;

const d2: Screen = {
  id: 'd2',
  kind: 'review',
  branch: 'D',
  block: dBlock,
  title: L('La grille de relecture', 'Review checklist'),
  intro: L('Huit critères pour tester ta proposition : quatre sont mesurés automatiquement, quatre sont à cocher.', 'Eight criteria to test your proposal: four are measured automatically, four are for you to tick.'),
  questions: [],
};

export const SCREENS: Record<string, Screen> = { profile, diag1, diag2, a1, a2, b1, b2, c1, c2, d1, d2 };

export const BRANCH_SCREENS: Record<Branch, string[]> = {
  A: ['a1', 'a2'],
  B: ['b1', 'b2'],
  C: ['c1', 'c2'],
  D: ['d1', 'd2'],
};

/** Ordered screens of the whole form for a given branch (undefined = pivot not answered yet).
 *  The speaker photo is not part of it: it comes with the preparation of the submission, from the roadmap. */
export function flowFor(branch?: Branch | null): string[] {
  const base = ['profile', 'diag1', 'diag2'];
  return branch ? [...base, ...BRANCH_SCREENS[branch]] : base;
}

/** The screen to show for a stored resume pointer. One that is no longer part of the form (the old 'photo' screen,
 *  which the previous release can still write while it serves traffic) falls back to the last screen of the branch. */
export function resumeScreen(branch: Branch | null | undefined, current: string): string {
  if (current === 'done') return 'done';
  const flow = flowFor(branch);
  return flow.includes(current) ? current : flow[flow.length - 1];
}

/** Total number of steps shown in the progress bar, including the final confirmation screen. */
export function totalSteps(branch?: Branch | null): number {
  return (branch ? flowFor(branch).length : 3 + 2) + 1;
}

export function visibleQuestions(screen: Screen, a: Answers): Question[] {
  return screen.questions.filter((q) => !q.showIf || q.showIf(a));
}

export function resolveOptions(q: Question, refs: Refs): Option[] {
  if (q.options === 'domains') return refs.domains;
  if (q.options === 'angles') return refs.angles;
  if (q.options === 'events') return refs.events;
  return q.options ?? [];
}

const PHONE_RE = /^\+?[0-9][0-9 ().-]{6,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors = Record<string, string>;

/** Validate answers for one screen. Returns error keys (i18n keys resolved by the UI). */
export function validateScreen(screen: Screen, a: Answers, refs: Refs): FieldErrors {
  const errors: FieldErrors = {};
  for (const q of visibleQuestions(screen, a)) {
    const v = a[q.code];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) errors[q.code] = 'required';
      continue;
    }
    switch (q.type) {
      case 'text':
      case 'longtext':
        if (typeof v !== 'string') errors[q.code] = 'invalid';
        else if (q.maxLength && v.length > q.maxLength) errors[q.code] = 'too_long';
        break;
      case 'phone':
        if (typeof v !== 'string' || !PHONE_RE.test(v.trim())) errors[q.code] = 'invalid_phone';
        break;
      case 'email':
        if (typeof v !== 'string' || !EMAIL_RE.test(v.trim())) errors[q.code] = 'invalid_email';
        break;
      case 'single': {
        const ok = resolveOptions(q, refs).some((o) => o.value === v);
        if (!ok) errors[q.code] = 'invalid';
        break;
      }
      case 'multi': {
        if (!Array.isArray(v)) {
          errors[q.code] = 'invalid';
          break;
        }
        const valid = resolveOptions(q, refs).map((o) => o.value);
        if (!v.every((x) => valid.includes(x))) errors[q.code] = 'invalid';
        else if (q.min && v.length < q.min) errors[q.code] = 'required';
        else if (q.max && v.length > q.max) errors[q.code] = 'too_many';
        break;
      }
      case 'scale': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors[q.code] = 'invalid';
        break;
      }
    }
  }
  return errors;
}

export function labelOf(options: Option[], value: string, locale: Locale): string {
  return options.find((o) => o.value === value)?.label[locale] ?? value;
}

/** Pick fields of the candidate row out of the profile answers. */
export function profileColumns(a: Answers) {
  return {
    name: String(a['P1'] ?? '').trim(),
    city: String(a['P2'] ?? ''),
    city_other: a['P2'] === 'autre' ? String(a['P2o'] ?? '').trim() : null,
    whatsapp: String(a['P3'] ?? '').trim(),
    email: a['P4'] ? String(a['P4']).trim().toLowerCase() : null,
    role: String(a['P6'] ?? '').trim(),
    seniority: String(a['P7'] ?? ''),
  };
}
