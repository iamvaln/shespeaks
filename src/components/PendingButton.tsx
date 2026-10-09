'use client';
import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';

/**
 * A submit button for a slow server action: disabled and relabelled while it runs (a second click would repeat the request), and,
 * when `confirmText` is given, asks before anything is sent.
 */
export function PendingButton({ children, pendingLabel, confirmText, onClick, ...props }: { children: ReactNode; pendingLabel: string; confirmText?: string } & ComponentProps<'button'>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={(e) => {
        if (!pending && confirmText && !window.confirm(confirmText)) { e.preventDefault(); return; }
        onClick?.(e);
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
