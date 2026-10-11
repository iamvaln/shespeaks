'use client';
import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';

/**
 * A submit button for a slow server action. While it runs it stays focusable (`aria-disabled`, not `disabled`: focus would be lost) but
 * a second click does nothing, it is relabelled, and a status region tells a screen reader. When `confirmText` is given, asks before
 * anything is sent.
 */
export function PendingButton({ children, pendingLabel, confirmText, onClick, ...props }: { children: ReactNode; pendingLabel: string; confirmText?: string } & ComponentProps<'button'>) {
  const { pending: formPending, data } = useFormStatus();
  // several submit buttons in one form (name + value): only the one that was pressed is relabelled; the others are only inert
  const mine = !props.name || props.value === undefined || data?.get(String(props.name)) === String(props.value);
  const pending = formPending && mine;
  const inert = formPending && !mine;
  return (
    <>
      <button
        {...props}
        aria-disabled={pending || inert || props.disabled || undefined}
        aria-busy={pending}
        onClick={(e) => {
          if (pending || inert) { e.preventDefault(); return; }
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
