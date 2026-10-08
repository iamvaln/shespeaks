'use client';
import { useTransition } from 'react';
import { setLocaleAction } from '@/app/actions';
import type { Locale } from '@/lib/questions';

export function LangSwitch({ locale }: { locale: Locale }) {
  const [pending, start] = useTransition();
  const other: Locale = locale === 'fr' ? 'en' : 'fr';
  return (
    <button
      type="button"
      className="lang-btn"
      disabled={pending}
      lang={other}
      aria-label={other === 'en' ? 'Switch to English' : 'Passer en français'}
      onClick={() => start(() => setLocaleAction(other).then(() => window.location.reload()))}
    >
      {other.toUpperCase()}
    </button>
  );
}
