'use client';
import { useEffect } from 'react';

/**
 * A link to a block that is folded (« Suivi ↓ ») must show it: the address names the <details> itself, which the browser does not open.
 * Opens the block the address (or a clicked #link) points at.
 */
export function OpenOnHash() {
  useEffect(() => {
    const open = (hash: string) => {
      let id = '';
      try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return; }
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
    };
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      if (a) open(a.getAttribute('href') ?? '');
    };
    const onHash = () => open(window.location.hash);
    open(window.location.hash);
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', onHash);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  return null;
}
