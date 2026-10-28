// WhatsApp links with a prefilled message (wa.me): the coach sends them from her own phone. Pure: unit-tested.
import type { Locale } from './questions.ts';

const digits = (n: string | null | undefined) => (n ?? '').replace(/\D/g, '');
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** A nudge to finish the interest form, in her language: where she stopped and her personal link. Null without a number. */
export function finishFormWhatsApp(i: { whatsapp: string | null | undefined; name: string | null | undefined; locale: Locale; screenLabel: string; resumeUrl: string }): string | null {
  const wa = digits(i.whatsapp);
  if (!wa) return null;
  const first = firstName(i.name);
  const text = i.locale === 'en'
    ? `Hello ${first}, this is the SheSpeaks team. You are nearly done with your interest form: you stopped at « ${i.screenLabel} ». Pick up where you left off here: ${i.resumeUrl}`
    : `Bonjour ${first}, c’est l’équipe SheSpeaks. Il te reste peu de chose pour finir ton formulaire d’intérêt : tu t’es arrêtée à « ${i.screenLabel} ». Reprends là où tu en étais ici : ${i.resumeUrl}`;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}
