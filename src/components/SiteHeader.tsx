import Link from 'next/link';
import { LangSwitch } from './LangSwitch';
import type { Locale } from '@/lib/questions';
import { t } from '@/lib/i18n';

/** Landing: night header with section links + CTA. App pages (form, roadmap): light header, logo + language only. */
export function SiteHeader({ locale, variant, cta }: { locale: Locale; variant: 'landing' | 'app'; cta?: { href: string; label: string; short?: string } }) {
  const n = t(locale).home.nav;
  const landing = variant === 'landing';
  return (
    <>
    <a className="skip-link" href="#main">{n.skip}</a>
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand" aria-label="SheSpeaks by Techies Connect'">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={landing ? '/brand/shespeaks-logo-nuit.svg' : '/brand/shespeaks-logo-clair.svg'} alt="SheSpeaks by Techies Connect'" width={102} height={42} />
        </Link>
        {landing && (
          <nav className="site-nav" aria-label={n.sections}>
            <a href="#evenements">{n.events}</a>
            <a href="#qui">{n.who}</a>
            <a href="#comment">{n.how}</a>
            <a href="#participer">{n.join}</a>
            <a href="#faq">{n.faq}</a>
          </nav>
        )}
        <div className="actions">
          <LangSwitch locale={locale} />
          {cta && (
            <Link className="btn btn-sm" href={cta.href}>
              {cta.short ? <><span className="cta-full">{cta.label}</span><span className="cta-short" aria-hidden="true">{cta.short}</span></> : cta.label}
            </Link>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
