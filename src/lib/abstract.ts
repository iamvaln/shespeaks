// Branch C: first-draft abstract assembled from the answers (spec: "Écran C2").
import type { Answers, Locale } from './questions.ts';
import { joinList, textLocale } from './text.ts';

const AUD_FR: Record<string, string> = {
  debutant: 'débutant·es',
  intermediaire: 'intermédiaires',
  confirme: 'confirmé·es',
};
const AUD_EN: Record<string, string> = {
  debutant: 'beginners',
  intermediaire: 'intermediate developers',
  confirme: 'experienced practitioners',
};

export function assembleAbstract(a: Answers, ui: Locale): string {
  const loc = textLocale(a['P5'], ui);
  const title = String(a['C1'] ?? '').trim();
  const aud = String(a['C2'] ?? '');
  const ideas = ['C3', 'C4', 'C5'].map((c) => String(a[c] ?? '').trim()).filter(Boolean);
  const gain = String(a['C6'] ?? '').trim();
  const list = joinList(ideas, loc);
  if (loc === 'en') {
    const who = aud === 'tous' ? 'a general audience' : (AUD_EN[aud] ?? 'developers');
    return `${title}\n\nThis talk is for ${who}. Together, we will look at ${list}. Each point is backed by concrete examples from my experience.\n\nBy the end of the session, you will leave with ${gain}.`;
  }
  const who = aud === 'tous' ? 'à tous les publics' : `aux ${AUD_FR[aud] ?? 'développeur·ses'}`;
  return `${title}\n\nCe talk s’adresse ${who}. Ensemble, nous verrons ${list}. Chaque point s’appuie sur des exemples concrets tirés de mon expérience.\n\nÀ la fin de la session, vous repartirez avec ${gain}.`;
}
