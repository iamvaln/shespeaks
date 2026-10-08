import Link from 'next/link';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { t } from '@/lib/i18n';
import { SLIDES } from '@/content/slides';
import { LANDING } from '@/content/landing';
import './landing.css';
import { SiteHeader } from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const d = t(locale).home;
  return { title: { absolute: d.metaTitle }, description: d.metaDescription };
}

const Check = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="var(--amber)" /><path d="M6.2 11.4l3.2 3.1 6.4-6.6" fill="none" stroke="var(--on-amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Dash = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" /><path d="M6.5 11h9" stroke="var(--ink-muted)" strokeWidth="2" strokeLinecap="round" /></svg>
);

export default async function Home() {
  const locale = await getLocale();
  const d = t(locale).home;
  const c = await getCandidateFromCookie();
  const cta = c ? (c.completed_at ? { href: '/plan', label: d.hero.seePlan } : { href: '/interet', label: d.hero.resume }) : { href: '/interet', label: d.hero.cta, short: d.hero.ctaShort };

  return (
    <div className="landing-refresh" data-theme="clair">
      <SiteHeader locale={locale} variant="landing" cta={cta} />
      <main id="main">
        {/* Editorial hero — one approved photograph, white-to-stage transition */}
        <section className="band hero" data-theme="clair" aria-labelledby="h1">
          <div className="container hero-grid">
            <div className="hero-content">
              <p className="label-s">{d.stage.eyebrow}</p>
              <h1 id="h1" className="display-xl">{d.hero.h1}</h1>
              <p className="lead">{d.hero.lead}</p>
              <div className="cta-row">
                <Link className="btn btn-lg" href={cta.href}>{cta.label} <span aria-hidden="true">→</span></Link>
                <a className="btn btn-lg btn-ghost" href="#comment">{d.hero.secondary}</a>
              </div>
            </div>
            <figure className="landing-hero-media">
              {LANDING.heroPhoto && <img src={LANDING.heroPhoto.src} alt={LANDING.heroPhoto.alt[locale]} width={960} height={1080} fetchPriority="high" />}
            </figure>
          </div>
        </section>

        <section className="band stage" data-theme="clair" aria-labelledby="h-stage">
          <div className="container">
            <p className="label-s">{d.stage.eyebrow}</p>
            <h2 id="h-stage" className="h2">{d.stage.title}</h2>
            <p className="section-lead">{d.stage.lead}</p>
            <ul className="landing-formats">
              {SLIDES.map((format) => (
                <li key={format.id}>
                  {format.photo && <img className="landing-format-photo" src={format.photo} alt={format.alt?.[locale] ?? format.title[locale]} loading="lazy" />}
                  <div className="landing-format-body"><h3>{format.title[locale]}</h3>
                  <p>{format.caption[locale]}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Who can join ---------- */}
        <section id="qui" className="band band-light" data-theme="clair" aria-labelledby="h-who">
          <div className="container who-grid">
            <div>
              <p className="label-s">{d.who.eyebrow}</p>
              <h2 id="h-who" className="h2">{d.who.title}</h2>
              <p className="section-lead">{d.who.lead}</p>
            </div>
            <div className="who-cards">
              <div className="card card-lg">
                <h3>{d.who.mustTitle}</h3>
                <ul className="icon-list">{d.who.must.map((x) => <li key={x}><Check /><span>{x}</span></li>)}</ul>
              </div>
              <div className="card card-lg">
                <h3>{d.who.notTitle}</h3>
                <ul className="icon-list muted-list">{d.who.not.map((x) => <li key={x}><Dash /><span>{x}</span></li>)}</ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- How it works (light) ---------- */}
        <section id="comment" className="band" data-theme="clair" aria-labelledby="h-how">
          <div className="container">
            <p className="label-s">{d.how.eyebrow}</p>
            <h2 id="h-how" className="h2">{d.how.title}</h2>
            <p className="section-lead">{d.how.lead}</p>
            <ol className="timeline">
              {d.how.steps.map(([title, text], i) => (
                <li key={title}>
                  <span className="ring-num" aria-hidden="true">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
            
          </div>
        </section>

        {/* ---------- How to join (light, raised) ---------- */}
        <section id="participer" className="band band-light" data-theme="clair" aria-labelledby="h-join">
          <div className="container">
            <p className="label-s">{d.join.eyebrow}</p>
            <h2 id="h-join" className="h2">{d.join.title}</h2>
            <ol className="join-steps">
              {d.join.steps.map(([title, text], i) => (
                <li key={title} className="card card-lg">
                  <span className="ring-num" aria-hidden="true">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
            <div className="cta-row"><Link className="btn btn-lg" href={cta.href}>{cta.label}</Link></div>
          </div>
        </section>

        {/* ---------- FAQ (light) ---------- */}
        <section id="faq" className="band" data-theme="clair" aria-labelledby="h-faq">
          <div className="container faq-wrap">
            <div>
              <p className="label-s">{d.faq.eyebrow}</p>
              <h2 id="h-faq" className="h2">{d.faq.title}</h2>
            </div>
            <div className="faq">
              {d.faq.items.map(([q, a]) => (
                <details key={q} className="faq-item">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Final call (night) ---------- */}
        <section className="band final-cta" data-theme="nuit" aria-labelledby="h-final">
          <div className="container">
            <h2 id="h-final" className="h2">{d.final.title}</h2>
            <p className="section-lead">{d.final.lead}</p>
            <div className="cta-row"><Link className="btn btn-lg" href={cta.href}>{cta.label}</Link></div>
          </div>
        </section>
      </main>
      <footer className="landing-footer" data-theme="nuit">
        <div className="container footer-row">
          <img src="/brand/shespeaks-logo-nuit.svg" alt="SheSpeaks by Techies Connect'" width={153} height={63} />
          {LANDING.socials.length > 0 && (
            <nav aria-label={locale === 'fr' ? 'Réseaux sociaux' : 'Social media'}>
              {LANDING.socials.map((social) => <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer">{social.label}</a>)}
            </nav>
          )}
        </div>
      </footer>
    </div>
  );
}
