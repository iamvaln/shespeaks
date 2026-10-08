// Home page slider. Each slide shows `photo` when set, otherwise an on-brand illustration (src/components/Scenes.tsx).
//
// TO ADD A REAL PHOTO: put the file in /public/slider/ (JPG or WebP, ~1600 px wide, under 300 KB), then set
//   photo: '/slider/your-file.jpg'
// on the matching slide, and write a real alt text (who is on the picture, what she is doing).
// Use photos of consenting participants only (the form's photo consent covers announcements, not this page).
import type { Loc } from '../lib/questions.ts';
import type { SceneKind } from '../components/Scenes.tsx';

export interface Slide {
  id: string;
  scene: SceneKind;
  photo?: string;
  alt?: Loc; // required when `photo` is set
  title: Loc;
  caption: Loc;
}

export const SLIDES: Slide[] = [
  {
    id: 'talk',
    scene: 'talk',
    photo: '/slider/SheSpeaks_Tech_Talk_Cybersecurite.png',
    alt: { fr: 'Une intervenante présente un sujet de cybersécurité lors d’un Tech Talk', en: 'A woman presents a cybersecurity topic during a tech talk' },
    title: { fr: 'Tech Talk', en: 'Tech Talk' },
    caption: { fr: 'Partage ton expertise avec le public', en: 'Share your expertise with an audience' },
  },
  {
    id: 'workshop',
    scene: 'workshop',
    photo: '/slider/Generative AI Workshop_ From Idea to Production.png',
    alt: { fr: 'Atelier pratique collaboratif autour de l’intelligence artificielle', en: 'Collaborative hands-on workshop about artificial intelligence' },
    title: { fr: 'Atelier', en: 'Workshop' },
    caption: { fr: 'Fais pratiquer les participantes', en: 'Guide participants through hands-on activities' },
  },
  {
    id: 'demo',
    scene: 'demo',
    photo: '/slider/API Security Webinar in a Cozy Home Office.png',
    alt: { fr: 'Une intervenante anime un webinaire technique depuis son bureau', en: 'A woman hosts a technical webinar from her desk' },
    title: { fr: 'Démo en direct / Webinaire', en: 'Live demo / Webinar' },
    caption: { fr: 'Présente un projet ou une solution en direct', en: 'Show a project or solution live' },
  },
];