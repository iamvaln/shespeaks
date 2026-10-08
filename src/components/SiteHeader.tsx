import Link from 'next/link';
import { LangSwitch } from './LangSwitch';
import { LangMenu } from './LangMenu';
import { Icon } from './LandingIcons';
import type { Locale } from '@/lib/questions';
import { t } from '@/lib/i18n';

/** Landing: light header with section links + CTA. App pages (form, roadmap): light header, logo + language only. */
export function SiteHeader({ locale, variant, cta }: { locale: Locale; variant: 'landing' | 'app'; cta?: { href: string; label: string; short?: string } }) {
  const n = t(locale).home.nav;
  const landing = variant === 'landing';
  return (
    <>
    <a className="skip-link" href="#main">{n.skip}</a>
    <header className="site-header" data-theme={landing ? 'clair' : undefined}>
      <div className="container bar">
        <Link href="/" className="brand" aria-label="SheSpeaks by Techies Connect'">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shespeaks-logo-clair.svg" alt="SheSpeaks by Techies Connect'" width={102} height={42} />
        </Link>
        {landing && (
          <nav className="site-nav" aria-label={n.sections}>
            <a href="#qui">{n.who}</a>
            <a href="#comment">{n.how}</a>
            <a href="#formats">{n.formats}</a>
            <a href="#faq">{n.faq}</a>
          </nav>
        )}
        <div className="actions">
          {landing ? <LangMenu locale={locale} /> : <LangSwitch locale={locale} />}
          {cta && (
            <Link className="btn btn-sm" href={cta.href}>
              {cta.short ? <><span className="cta-full">{cta.label}</span><span className="cta-short">{cta.short}</span></> : cta.label}
              {landing && <Icon name="arrow" size={16} className="cta-arrow" />}
            </Link>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
