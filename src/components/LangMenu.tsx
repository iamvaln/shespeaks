'use client';
import { useEffect, useRef, useTransition } from 'react';
import { setLocaleAction } from '@/app/actions';
import type { Locale } from '@/lib/questions';
import { Icon } from './LandingIcons';

const NAMES: Record<Locale, string> = { fr: 'Français', en: 'English' };

/** Language menu for the landing header: shows the current language, opens a list with both. Closes on Escape and outside clicks. */
export function LangMenu({ locale }: { locale: Locale }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const close = (e: Event) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    const esc = (e: KeyboardEvent) => { const d = ref.current; if (e.key === 'Escape' && d?.open) { d.open = false; d.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const pick = (l: Locale) => {
    if (l === locale) { const d = ref.current; if (d) { d.open = false; d.querySelector('summary')?.focus(); } return; }
    start(() => setLocaleAction(l).then(() => window.location.reload()));
  };

  return (
    <details className="lang-menu" ref={ref} onBlur={(e) => { const next = e.relatedTarget as Node | null; if (next && !e.currentTarget.contains(next)) e.currentTarget.open = false; }}>
      <summary aria-label={locale === 'fr' ? 'Langue : Français' : 'Language: English'}>
        <span aria-hidden="true">{locale.toUpperCase()}</span>
        <Icon name="chevron" size={14} className="lang-menu-chevron" />
      </summary>
      <ul>
        {(['fr', 'en'] as Locale[]).map((l) => (
          <li key={l}>
            <button type="button" lang={l} aria-current={l === locale ? 'true' : undefined} disabled={pending} onClick={() => pick(l)}>
              {NAMES[l]}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
