'use client';
import type { ReactNode } from 'react';

/**
 * « Utiliser ce titre / ce résumé »: copies a proposal into a field of the subject form (by id) and focuses it. Nothing is saved: the
 * coach reads, edits if needed, then presses « Enregistrer le sujet ».
 */
export function UseInField({ target, value, children }: { target: string; value: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="a-btn is-ghost is-sm"
      onClick={() => {
        const el = document.getElementById(target) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }}
    >
      {children}
    </button>
  );
}
