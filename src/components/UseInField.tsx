'use client';
import type { ReactNode } from 'react';

/**
 * « Utiliser ce titre / ce résumé »: copies a proposal into a field of the subject form (by id) and focuses it. Nothing is saved: the
 * coach reads, edits if needed, then presses « Enregistrer le sujet ».
 */
export function UseInField({ target, value, children, label }: { target: string; value: string; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      className="a-btn is-ghost is-sm"
      aria-label={label}
      onClick={() => {
        const el = document.getElementById(target) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      }}
    >
      {children}
    </button>
  );
}
