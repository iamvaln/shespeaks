// Branch D review grid: 4 automatic criteria + 4 self-checks (spec: "Écran D2").
import { norm, wordCount } from './text.ts';

export interface AutoCheck {
  code: 'title' | 'length' | 'audience' | 'benefit';
  ok: boolean;
  /** measured value, locale-neutral parts so the UI can format it */
  words?: number;
  keyword?: string;
}

const AUDIENCE_KW = [
  'debutant', 'developpeu', 'etudiant', "s'adresse", 'public', 'intermediaire', 'confirme', 'designer', 'professionnel',
  'beginner', 'student', 'developer', 'aimed at', 'audience', 'is for', 'junior', 'engineer', 'practitioner', 'anyone',
];
const BENEFIT_KW = [
  'repartir', 'repartez', 'apprendr', 'appris', 'decouvr', 'saurez', 'maitris', 'comprendr', 'serez capable', 'gagn', 'emporter',
  'learn', 'discover', 'take away', 'walk away', 'leave with', 'by the end', 'understand', 'master', 'be able to',
];

export function autoChecks(title: string, abstract: string): AutoCheck[] {
  const tw = wordCount(title);
  const aw = wordCount(abstract);
  const n = norm(abstract);
  const aud = AUDIENCE_KW.find((k) => n.includes(k));
  const ben = BENEFIT_KW.find((k) => n.includes(k));
  return [
    { code: 'title', ok: tw >= 1 && tw <= 12, words: tw },
    { code: 'length', ok: aw >= 80 && aw <= 200, words: aw },
    { code: 'audience', ok: !!aud, keyword: aud },
    { code: 'benefit', ok: !!ben, keyword: ben },
  ];
}
