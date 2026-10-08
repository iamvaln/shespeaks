import type { Loc } from '@/lib/questions';

// Landing page content that is not plain text. Photos are optimised crops of the approved originals in /public/slider/
// (see public/landing/README.md and scripts/landing-images.py). Only use approved imagery and verified profile URLs here.
export const LANDING: {
  hero: { wide: string; tall: string; alt: Loc };
  formats: Record<'talk' | 'workshop' | 'demo', string>;
  quotePhoto: string;
  ctaPhoto: string;
  /** Quote band: the founder's words (src/lib/i18n.ts → home.quote). Set to false to hide the band. */
  showQuote: boolean;
  socials: { label: 'LinkedIn' | 'X'; href: string }[];
} = {
  hero: {
    wide: '/landing/hero-wide.webp',
    tall: '/landing/hero-tall.webp',
    alt: { fr: 'Une intervenante, micro en main, présente son sujet devant un écran', en: 'A woman holding a microphone presents her topic in front of a screen' },
  },
  formats: { talk: '/landing/format-talk.webp', workshop: '/landing/format-workshop.webp', demo: '/landing/format-demo.webp' },
  quotePhoto: '/landing/quote.webp',
  ctaPhoto: '/landing/cta.webp',
  showQuote: true,
  socials: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/iamnv/' }, { label: 'X', href: 'https://x.com/iam_n_v' }],
};
