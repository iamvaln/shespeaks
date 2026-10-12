'use client';

/** « Tout déplier / Tout replier » for a list of <details>: the tracks of a fiche can run long, and so can the page. */
export function FoldAll({ selector, what }: { selector: string; what?: string }) {
  const set = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>(selector).forEach((d) => { d.open = open; });
  return (
    <div className="a-fold-all" role="group" aria-label={what}>
      <button type="button" className="a-link-btn" onClick={() => set(true)}>Tout déplier</button>
      <button type="button" className="a-link-btn" onClick={() => set(false)}>Tout replier</button>
    </div>
  );
}
