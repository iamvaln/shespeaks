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
  { id: 'talk', scene: 'talk', title: { fr: 'Talk', en: 'Talk' }, caption: { fr: '20 à 30 minutes devant le public', en: '20 to 30 minutes in front of the audience' } },
  { id: 'lightning', scene: 'lightning', title: { fr: 'Lightning talk', en: 'Lightning talk' }, caption: { fr: '5 à 10 minutes, une seule idée', en: '5 to 10 minutes, one single idea' } },
  { id: 'workshop', scene: 'workshop', title: { fr: 'Atelier', en: 'Workshop' }, caption: { fr: 'Les participantes pratiquent avec toi', en: 'Participants practise along with you' } },
  { id: 'demo', scene: 'demo', title: { fr: 'Démo en direct', en: 'Live demo' }, caption: { fr: 'Montre ce que tu as construit', en: 'Show what you built' } },
  { id: 'rehearsal', scene: 'rehearsal', title: { fr: 'Répétition générale', en: 'Dress rehearsal' }, caption: { fr: 'Devant le groupe, avant l’événement', en: 'In front of the group, before the event' } },
  { id: 'dayd', scene: 'dayd', title: { fr: 'Jour J', en: 'Talk day' }, caption: { fr: 'Le groupe est dans la salle pour t’encourager', en: 'The group is in the room to cheer you on' } },
];
