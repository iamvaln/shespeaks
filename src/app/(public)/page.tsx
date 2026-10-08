import Link from 'next/link';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { t } from '@/lib/i18n';
import { LANDING } from '@/content/landing';
import './landing.css';
import { SiteHeader } from '@/components/SiteHeader';
import { Icon, type IconName } from '@/components/LandingIcons';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const d = t(locale).home;
  return { title: { absolute: d.metaTitle }, description: d.metaDescription };
}

const FORMAT_ICONS: Record<string, IconName> = { talk: 'mic', workshop: 'users', demo: 'monitor' };
const STEP_ICONS: IconName[] = ['file', 'users', 'slides', 'chat', 'mic'];

const Check = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="var(--amber)" /><path d="M6.2 11.4l3.2 3.1 6.4-6.6" fill="none" stroke="var(--on-amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Dash = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" /><path d="M6.5 11h9" stroke="var(--ink-muted)" strokeWidth="2" strokeLinecap="round" /></svg>
);
/** The orange curve that frames the photo: stretches with the height of its box. */
const Arc = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M66 0 Q-22 50 66 100" fill="none" stroke="currentColor" strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
  </svg>
);
const QuoteMark = () => (
  <svg className="lp-quote-mark" width="40" height="32" viewBox="0 0 40 32" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M0 32V19.2C0 8.3 5.3 1.9 15.6 0l1.8 4.6C12 6.2 9.8 9.6 9.4 14H16V32H0zm22.4 0V19.2C22.4 8.3 27.7 1.9 38 0l1.8 4.6c-5.4 1.6-7.6 5-8 9.4H38.4V32h-16z" />
  </svg>
);
/** Highlights `part` (the end of the title) in orange. */
function withAccent(text: string, part: string) {
  const i = text.lastIndexOf(part);
  if (!part || i < 0) return text;
  return <>{text.slice(0, i)}<span className="lp-accent">{part}</span>{text.slice(i + part.length)}</>;
}

export default async function Home() {
  const locale = await getLocale();
  const d = t(locale).home;
  const c = await getCandidateFromCookie();
  const cta = c ? (c.completed_at ? { href: '/plan', label: d.hero.seePlan } : { href: '/interet', label: d.hero.resume }) : { href: '/interet', label: d.hero.cta, short: d.hero.ctaShort };
  const navLinks: [string, string][] = [['#qui', d.nav.who], ['#comment', d.nav.how], ['#formats', d.nav.formats], ['#faq', d.nav.faq]];

  return (
    <div className="landing-refresh" data-theme="clair">
      <SiteHeader locale={locale} variant="landing" cta={cta} />
      <main id="main">
        {/* ---------- Hero ---------- */}
        <section className="lp-hero" aria-labelledby="h1">
          <div className="lp-hero-media">
            <picture>
              <source media="(max-width: 899px)" srcSet={LANDING.hero.tall} />
              <img src={LANDING.hero.wide} alt={LANDING.hero.alt[locale]} width={1600} height={484} fetchPriority="high" decoding="async" />
            </picture>
            <Arc className="lp-arc" />
          </div>
          <div className="lp-wrap lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">{d.hero.eyebrow}</p>
              <h1 id="h1" className="lp-h1">{withAccent(d.hero.h1, d.hero.h1Accent)}</h1>
              <p className="lp-lead">{d.hero.lead}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-amber" href={cta.href}>{cta.label} <Icon name="arrow" size={18} /></Link>
                <a className="lp-btn lp-btn-outline" href="#comment">{d.hero.secondary}</a>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Formats ---------- */}
        <section id="formats" className="lp-section lp-formats" aria-labelledby="h-formats">
          <div className="lp-wrap">
            <div className="lp-head">
              <div>
                <h2 id="h-formats" className="lp-h2">{d.formats.title}</h2>
                <p className="lp-sub">{d.formats.lead}</p>
              </div>
              <a className="lp-link" href="#all-formats">{d.formats.all} <Icon name="arrow" size={16} /></a>
            </div>
            <ul className="lp-cards">
              {d.formats.items.map((f) => (
                <li key={f.id} className="lp-card">
                  <img className="lp-card-photo" src={LANDING.formats[f.id as keyof typeof LANDING.formats]} alt={f.alt} width={600} height={400} loading="lazy" decoding="async" />
                  <span className="lp-bubble lp-card-icon"><Icon name={FORMAT_ICONS[f.id]} size={22} /></span>
                  <div className="lp-card-body">
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div id="all-formats" className="lp-more" tabIndex={-1}>
              <h3>{d.formats.allTitle}</h3>
              <p>{d.formats.allLead}</p>
              <ul className="lp-chips">{d.formats.list.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="comment" className="lp-section lp-steps-band" aria-labelledby="h-how">
          <div className="lp-wrap">
            <h2 id="h-how" className="lp-h2">{d.how.title}</h2>
            <p className="lp-sub">{d.how.lead}</p>
            <ol className="lp-steps">
              {d.how.steps.map(([title, text], i) => (
                <li key={title}>
                  <div className="lp-step-head">
                    <span className="lp-num" aria-hidden="true">{i + 1}</span>
                    <span className="lp-bubble"><Icon name={STEP_ICONS[i]} size={24} /></span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Who can join ---------- */}
        <section id="qui" className="lp-section lp-who" aria-labelledby="h-who">
          <div className="lp-wrap lp-who-grid">
            <div>
              <p className="lp-eyebrow">{d.who.eyebrow}</p>
              <h2 id="h-who" className="lp-h2 lp-h2-lg">{d.who.title}</h2>
              <p className="lp-sub">{d.who.lead}</p>
            </div>
            <div className="lp-who-cards">
              <div className="lp-panel">
                <h3>{d.who.mustTitle}</h3>
                <ul className="lp-checks">{d.who.must.map((x) => <li key={x}><Check /><span>{x}</span></li>)}</ul>
              </div>
              <div className="lp-panel">
                <h3>{d.who.notTitle}</h3>
                <ul className="lp-checks lp-checks-muted">{d.who.not.map((x) => <li key={x}><Dash /><span>{x}</span></li>)}</ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Questions ---------- */}
        <section id="faq" className="lp-section lp-band" aria-labelledby="h-faq">
          <div className="lp-wrap lp-faq-grid">
            <div>
              <p className="lp-eyebrow">{d.faq.eyebrow}</p>
              <h2 id="h-faq" className="lp-h2 lp-h2-lg">{d.faq.title}</h2>
            </div>
            <div className="lp-faq">
              {d.faq.items.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Quote ---------- */}
        {LANDING.showQuote && (
          <section className="lp-quote" aria-label={locale === 'fr' ? 'Témoignage' : 'Testimonial'}>
            <div className="lp-quote-photo"><img src={LANDING.quotePhoto} alt="" width={1400} height={264} loading="lazy" decoding="async" /></div>
            <div className="lp-wrap lp-quote-inner">
              <figure className="lp-quote-figure">
                <QuoteMark />
                <blockquote><p>{d.quote.text}</p></blockquote>
                <figcaption><strong>{d.quote.name}</strong><span>{d.quote.role}</span></figcaption>
              </figure>
            </div>
          </section>
        )}

        {/* ---------- Final call ---------- */}
        <section className="lp-cta" data-theme="nuit" aria-labelledby="h-final">
          <div className="lp-cta-photo">
            <img src={LANDING.ctaPhoto} alt="" width={1400} height={187} loading="lazy" decoding="async" />
            <Arc className="lp-arc" />
          </div>
          <div className="lp-wrap lp-cta-inner">
            <div className="lp-cta-copy">
              <p className="lp-eyebrow lp-eyebrow-night">{d.final.eyebrow}</p>
              <h2 id="h-final">{d.final.title}</h2>
            </div>
            <Link className="lp-btn lp-btn-amber" href={cta.href}>{cta.label} <Icon name="arrow" size={18} /></Link>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <Link href="/" className="lp-footer-logo" aria-label="SheSpeaks by Techies Connect'">
            <img src="/brand/shespeaks-logo-clair.svg" alt="" width={136} height={56} />
          </Link>
          <nav className="lp-footer-nav" aria-label={d.nav.sections}>
            {navLinks.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="lp-footer-end">
            {/* the coach space is French only; the login form is rate limited */}
            <a className="lp-coach-link" href="/admin/login" lang="fr" rel="nofollow">Espace coach</a>
            {LANDING.socials.length > 0 && (
              <nav className="lp-social" aria-label={locale === 'fr' ? 'Réseaux sociaux' : 'Social media'}>
                {LANDING.socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
                    <Icon name={s.label === 'LinkedIn' ? 'linkedin' : 'x'} size={22} />
                  </a>
                ))}
              </nav>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
