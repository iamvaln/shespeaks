import type { Loc } from '@/lib/questions';

// Only use approved existing imagery and verified official profile URLs here.
// Until supplied, reuse the existing brand illustration without inventing a photo or profile.
export const LANDING: {
  heroPhoto?: { src: string; alt: Loc };
  socials: { label: 'LinkedIn' | 'X'; href: string }[];
} = {
  socials: [],
};
