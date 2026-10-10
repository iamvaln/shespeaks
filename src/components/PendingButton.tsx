'use client';
import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';

/**
 * A submit button for a slow server action. While it runs it stays focusable (`aria-disabled`, not `disabled`: focus would be lost) but
 * a second click does nothing, it is relabelled, and a status region tells a screen reader. When `confirmText` is given, asks before
 * anything is sent.
 */
export function PendingButton({ children, pendingLabel, confirmText, onClick, ...props }: { children: ReactNode; pendingLabel: string; confirmText?: string } & ComponentProps<'button'>) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        {...props}
        aria-disabled={pending || props.disabled || undefined}
        aria-busy={pending}
        onClick={(e) => {
          if (pending) { e.preventDefault(); return; }
          if (confirmText && !window.confirm(confirmText)) { e.preventDefault(); return; }
          onClick?.(e);
        }}
      >
        {pending ? pendingLabel : children}
      </button>
      <span className="sr-only" role="status">{pending ? pendingLabel : ''}</span>
    </>
  );
}
