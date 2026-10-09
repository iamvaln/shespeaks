// Small pure text helpers shared by topics, abstract and review logic.
import type { Locale } from './questions.ts';

export const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'");

export const truncate = (s: string, max: number): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max).trimEnd() + '…' : one;
};

export const capitalize = (s: string): string => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

export function joinList(items: string[], locale: Locale): string {
  const list = items.map((i) => i.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  const and = locale === 'fr' ? ' et ' : ' and ';
  return list.slice(0, -1).join(', ') + and + list[list.length - 1];
}

/** Language used to write generated text: the talk language, falling back on the UI language. */
export function textLocale(talkLanguage: unknown, ui: Locale): Locale {
  if (talkLanguage === 'en') return 'en';
  if (talkLanguage === 'fr') return 'fr';
  return ui;
}

/** French typography: a no-break space before : ? ! ; » and after «, so punctuation never starts a line. */
export const typoFr = (s: string): string => s.replace(/ ([:?!;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

/** Two letters for an avatar: first letters of the first and last words (« Valentine Nguemne » → VN). */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  const first = [...w[0]][0];
  const last = w.length > 1 ? [...w[w.length - 1]][0] : '';
  return (first + last).toLocaleUpperCase('fr');
}
