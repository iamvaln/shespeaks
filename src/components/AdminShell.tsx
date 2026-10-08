'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './admin-icons';

// The frame of the coach space: menu on the left (a drawer on a phone), a thin top bar with the search, then the page.
const GROUPS: { title: string; items: { href: string; label: string; icon: IconName; exact?: boolean; badge?: boolean }[] }[] = [
  { title: 'Suivi', items: [{ href: '/admin', label: 'Tableau de bord', icon: 'dashboard', exact: true }, { href: '/admin/candidates', label: 'Candidates', icon: 'users', badge: true }] },
  { title: 'Programme', items: [{ href: '/admin/events', label: 'Événements', icon: 'calendar' }, { href: '/admin/coaches', label: 'Coachs', icon: 'coach' }] },
  { title: 'Réglages', items: [{ href: '/admin/settings', label: 'Paramètres', icon: 'sliders' }, { href: '/admin/emails', label: 'Emails', icon: 'mail' }] },
];
const WIDE = '(min-width: 900px)';

export function AdminShell({ toProcess, coachName, initials, signOut, children }: {
  toProcess: number; coachName: string; initials: string; signOut: ReactNode; children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const side = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // a page change closes the drawer and the phone search
  useEffect(() => { setOpen(false); setSearching(false); }, [path]);

  // open drawer: Escape closes it, so does a window wide enough to show the menu; focus goes in, then back to the button
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(WIDE);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); burger.current?.focus(); } };
    const onWide = () => { if (mq.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onWide);
    side.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => { document.removeEventListener('keydown', onKey); mq.removeEventListener('change', onWide); };
  }, [open]);

  useEffect(() => { if (searching) search.current?.focus(); }, [searching]);

  // « / » jumps to the search (not while typing somewhere, and only where the field is shown)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (search.current && search.current.offsetParent !== null) { e.preventDefault(); search.current.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Tab stays inside the open drawer
  const trap = (e: KeyboardEvent<HTMLElement>) => {
    if (!open || e.key !== 'Tab') return;
    const f = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="app" data-open={open ? '' : undefined}>
      <a className="skip-link" href="#contenu">Aller au contenu</a>

      <nav ref={side} id="menu-principal" className="app-side" aria-label="Navigation principale" onKeyDown={trap}>
        <div className="app-side-head">
          <Link href="/admin" className="app-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/shespeaks-logo-nuit.svg" alt="SheSpeaks" />
          </Link>
          <button type="button" className="app-icon-btn app-close" data-autofocus="" aria-label="Fermer le menu" onClick={() => { setOpen(false); burger.current?.focus(); }}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {GROUPS.map((g) => (
          <div className="app-group" key={g.title}>
            <p className="app-group-title">{g.title}</p>
            {g.items.map((it) => {
              const active = it.exact ? path === it.href : path.startsWith(it.href);
              return (
                <Link key={it.href} href={it.href} className="app-link" aria-current={active ? 'page' : undefined}>
                  <Icon name={it.icon} />
                  <span>{it.label}</span>
                  {it.badge && toProcess > 0 ? <span className="app-badge">{toProcess}<span className="sr-only"> à traiter</span></span> : null}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="app-user">
          <span className="app-avatar" aria-hidden="true">{initials}</span>
          <span className="app-user-name"><strong>{coachName}</strong><span>Coach</span></span>
          {signOut}
        </div>
      </nav>
      <div className="app-scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <div className="app-main">
        <header className="app-top">
          <button ref={burger} type="button" className="app-icon-btn app-burger" aria-label="Ouvrir le menu" aria-expanded={open} aria-controls="menu-principal" onClick={() => setOpen(true)}>
            <Icon name="menu" size={24} />
          </button>
          <Link href="/admin" className="app-brand-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/shespeaks-logo-nuit.svg" alt="SheSpeaks" />
          </Link>
          <form className={`app-search${searching ? ' is-open' : ''}`} role="search" action="/admin/candidates" method="get">
            <label className="sr-only" htmlFor="q-global">Chercher une candidate</label>
            <Icon name="search" />
            <input id="q-global" ref={search} name="q" type="search" placeholder="Chercher une candidate, un sujet, un numéro…" autoComplete="off" />
            <kbd aria-hidden="true">/</kbd>
          </form>
          <button type="button" className="app-icon-btn app-search-toggle" aria-label="Rechercher" aria-expanded={searching} onClick={() => setSearching((s) => !s)}>
            <Icon name="search" size={22} />
          </button>
          <a className="app-site" href="/" target="_blank" rel="noopener noreferrer">Voir le site public <Icon name="external" size={14} /></a>
          <span className="app-avatar app-avatar-sm" aria-hidden="true">{initials}</span>
        </header>
        <main id="contenu" className="app-content admin-main" tabIndex={-1} inert={open ? true : undefined}>{children}</main>
      </div>
    </div>
  );
}
