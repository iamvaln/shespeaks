import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { wizardState } from '@/lib/diagnostic';
import { getRefs } from '@/lib/data';
import { Wizard, type WizardInit } from '@/components/Wizard';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === 'fr' ? 'Soumettre mon intérêt' : 'Submit my interest' };
}

export default async function InteretPage() {
  const locale = await getLocale();
  const c = await getCandidateFromCookie();
  if (c?.completed_at) redirect('/plan');
  let init: WizardInit;
  if (c) {
    const s = await wizardState(c);
    init = { candidate: s.candidate, answers: s.answers, refs: s.refs, photos: s.photos, consent: s.consent };
    if (s.draft && c.branch === 'C' && s.answers['C-abstract'] === undefined) init.answers = { ...s.answers, 'C-abstract': s.draft };
  } else {
    init = { candidate: null, answers: {}, refs: await getRefs(), photos: [], consent: false };
  }
  return <Wizard key={c?.token ?? 'new'} init={init} locale={locale} />;
}
