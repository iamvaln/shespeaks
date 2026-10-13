import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { wizardState } from '@/lib/diagnostic';
import { admission } from '@/lib/admission';
import { getFormRefs } from '@/lib/data';
import { Wizard, type WizardInit } from '@/components/Wizard';
import { ClosedNotice } from '@/components/ClosedNotice';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === 'fr' ? 'Soumettre mon intérêt' : 'Submit my interest' };
}

export default async function InteretPage() {
  const locale = await getLocale();
  const c = await getCandidateFromCookie();
  if (c?.completed_at) redirect('/plan');
  const gate = await admission(c);
  if (!gate.open) return <ClosedNotice locale={locale} closedOn={gate.closedOn} />;
  let init: WizardInit;
  if (c) {
    const s = await wizardState(c);
    init = { candidate: s.candidate, answers: s.answers, refs: s.refs };
    if (s.draft && c.branch === 'C' && s.answers['C-abstract'] === undefined) init.answers = { ...s.answers, 'C-abstract': s.draft };
  } else {
    init = { candidate: null, answers: {}, refs: await getFormRefs() };
  }
  return <Wizard key={c?.token ?? 'new'} init={init} locale={locale} />;
}
