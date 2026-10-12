'use client';
import { useFormStatus } from 'react-dom';
import { useContext, type ComponentProps, type ReactNode } from 'react';
import { InlinePending } from './InlineForm';
import { EDITING_REASON, useEditing } from './EditScope';

/**
 * A submit button for a slow server action. While it runs it stays focusable (`aria-disabled`, not `disabled`: focus would be lost) but
 * a second click does nothing, it is relabelled, and a status region tells a screen reader. When `confirmText` is given, asks before
 * anything is sent.
 */
export function PendingButton({ children, pendingLabel, confirmText, onClick, lockWhenEditing, title, ...props }: {
  children: ReactNode; pendingLabel: string; confirmText?: string;
  /** Greyed while a form of the nearest EditScope holds unsaved edits (what this button sends or replaces would not include them). */
  lockWhenEditing?: boolean;
} & ComponentProps<'button'>) {
  const status = useFormStatus();
  const inline = useContext(InlinePending); // inside an InlineForm, its own state (the form is not submitted through `action`)
  const formPending = inline ? inline.pending : status.pending;
  const data = inline ? inline.data : status.data;
  // several submit buttons in one form (name + value): only the one that was pressed is relabelled; the others are only inert
  const mine = !props.name || props.value === undefined || data?.get(String(props.name)) === String(props.value);
  const pending = formPending && mine;
  const editing = useEditing();
  const barred = !!lockWhenEditing && editing;
  const inert = (formPending && !mine) || barred;
  return (
    <>
      <button
        {...props}
        title={barred ? EDITING_REASON : title}
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
