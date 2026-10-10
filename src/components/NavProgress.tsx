'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * A thin bar across the top of the window from the click on a link of the coach space until the next page has arrived. Without it a page that
 * the server is slow to build looks like a click that did nothing. It is a click listener rather than a « loading » screen on purpose: a loading
 * screen makes the server start answering before it knows whether the page exists, and a made-up address would then answer 200 instead of 404.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [pathname, search]); // the new page is there

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page, or only a #anchor
      setBusy(true);
    };
    // in the capture phase, so that this runs before Next's Link handles the click (a Link that navigates calls preventDefault() and would then be skipped)
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const giveUp = setTimeout(() => setBusy(false), 30_000); // never leave the bar on for ever
    return () => clearTimeout(giveUp);
  }, [busy]);

  if (!busy) return null;
  return (
    <>
      <div className="a-navbar" aria-hidden="true" />
      <span className="sr-only" role="status">Chargement de la page…</span>
    </>
  );
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
