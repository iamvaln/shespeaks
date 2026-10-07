'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene, type SceneKind } from './Scenes';

export interface SlideView {
  id: string;
  scene: SceneKind;
  photo?: string;
  alt: string;
  title: string;
  caption: string;
}
export interface SliderLabels {
  region: string; prev: string; next: string; pause: string; play: string; goTo: string; // goTo contains "{n}"
}

const INTERVAL = 5500;

/** Swipeable scroll-snap carousel. Autoplays, but never for people who asked for reduced motion; pauses on hover/focus and via a button (WCAG 2.2.2). */
export function HeroSlider({ slides, labels }: { slides: SlideView[]; labels: SliderLabels }) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);
  const [reduced, setReduced] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { setReduced(mq.matches); if (mq.matches) setPlaying(false); };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    const n = slides.length;
    const target = ((i % n) + n) % n;
    const child = el.children[target] as HTMLElement | undefined;
    const first = el.children[0] as HTMLElement | undefined;
    if (!child || !first) return;
    el.scrollTo({ left: child.offsetLeft - first.offsetLeft, behavior: smooth && !reduced ? 'smooth' : 'auto' });
  }, [slides.length, reduced]);

  // keep `index` in sync with manual swipes
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const first = el.children[0] as HTMLElement;
        const second = el.children[1] as HTMLElement | undefined;
        const step = second ? second.offsetLeft - first.offsetLeft : el.clientWidth;
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
        const i = atEnd ? slides.length - 1 : Math.round(el.scrollLeft / Math.max(step, 1));
        indexRef.current = i;
        setIndex(i);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [slides.length]);

  useEffect(() => {
    if (!playing || hold || reduced) return;
    const id = window.setInterval(() => { if (!document.hidden) goTo(indexRef.current + 1); }, INTERVAL);
    return () => window.clearInterval(id);
  }, [playing, hold, reduced, goTo]);

  return (
    <div
      className="slider"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      <ul className="slider-track" ref={track} aria-live={playing && !hold ? 'off' : 'polite'}>
        {slides.map((s, i) => (
          <li key={s.id} className="slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${slides.length}`}>
            <figure>
              <div className="slide-media">
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo} alt={s.alt} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                ) : (
                  <Scene kind={s.scene} />
                )}
              </div>
              <figcaption>
                <strong>{s.title}</strong>
                <span>{s.caption}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <div className="slider-controls">
        <div className="slider-dots">
          {slides.map((s, i) => (
            <button key={s.id} type="button" className="dot" aria-label={labels.goTo.replace('{n}', String(i + 1))} aria-current={i === index ? 'true' : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
        <div className="slider-buttons">
          {!reduced && (
            <button type="button" className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? labels.pause : labels.play}>
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
              )}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => goTo(index - 1)} aria-label={labels.prev}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="icon-btn" onClick={() => goTo(index + 1)} aria-label={labels.next}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
