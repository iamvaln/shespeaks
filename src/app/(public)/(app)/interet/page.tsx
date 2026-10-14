import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { healStuck, wizardState } from '@/lib/diagnostic';
import { admission } from '@/lib/admission';
import { getFormRefs } from '@/lib/data';
import { Wizard, type WizardInit } from '@/components/Wizard';
import { ClosedNotice } from '@/components/ClosedNotice';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const c = await getCandidateFromCookie();
  // the tab, the history and screen readers name the page for what it shows: closed applications are not « Submit my interest »
  const closed = !c?.completed_at && !(await admission(c)).open;
  return { title: closed ? t(locale).closed.title : locale === 'fr' ? 'Soumettre mon intérêt' : 'Submit my interest' };
}

export default async function InteretPage() {
  const locale = await getLocale();
  // a dossier left « done » without its end date is finished first, so she lands on her space and the closing date does not apply to her
  const stored = await getCandidateFromCookie();
  const c = stored ? await healStuck(stored) : undefined;
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
