import type { ReactNode } from 'react';

/**
 * A block of the fiche that folds and unfolds: the heading is the summary, the content the body. A native <details>, so it works without
 * JavaScript and with the keyboard; it opens on the server's render and keeps the coach's choice across the in-place refreshes.
 * `flush` is for the cards without padding (their own head and rows carry it).
 */
export function Fold({ id, anchor, title, aside, children, flush, card = true, bodyClassName = 'a-stack', defaultOpen = true, className = '' }: {
  id: string; anchor?: string; title: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean;
  /** false: no card around it (a block that draws its own cards, as the roadmap) */
  card?: boolean; bodyClassName?: string; defaultOpen?: boolean; className?: string;
}) {
  return (
    <details id={anchor} className={`${card ? 'a-card ' : ''}a-fold${flush ? ' is-flush' : ''}${className ? ` ${className}` : ''}`} open={defaultOpen} aria-labelledby={id}>
      <summary className="a-fold-summary">
        <h2 id={id} className="a-h2">{title}</h2>
        {aside}
      </summary>
      <div className={`a-fold-body ${bodyClassName}`.trim()}>{children}</div>
    </details>
  );
}
