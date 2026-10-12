'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react';

/**
 * « Edit mode » of a block of the fiche. Every InlineForm that asks for it (`watchEdits`) tells its scope whether what the coach typed
 * differs from what is saved. While any form of the scope is being edited, its other buttons are greyed (an unsaved edit must not be
 * lost, or left out of what a neighbouring button then sends) and only the « Enregistrer » of the edited form is lit.
 */
type Scope = { editing: boolean; setDirty: (formId: string, dirty: boolean) => void };
export const EditScopeContext = createContext<Scope | null>(null);
/** The form a button sits in: does it hold unsaved edits? */
export const FormEditContext = createContext<{ dirty: boolean } | null>(null);

export function EditScope({ children }: { children: ReactNode }) {
  const [dirty, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const setDirty = useCallback((formId: string, on: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(formId) === on) return prev; // nothing changed: no render, so a check after every render cannot loop
      const next = new Set(prev);
      if (on) next.add(formId); else next.delete(formId);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ editing: dirty.size > 0, setDirty }), [dirty, setDirty]);
  return <EditScopeContext.Provider value={value}>{children}</EditScopeContext.Provider>;
}

/** True while a form of the nearest scope holds unsaved edits. */
export const useEditing = (): boolean => useContext(EditScopeContext)?.editing ?? false;

export const EDITING_REASON = 'Enregistre ou annule tes modifications d’abord.';
export const NOTHING_TO_SAVE_REASON = 'Rien à enregistrer : modifie d’abord un champ.';

const norm = (s: string) => s.replace(/\r\n?/g, '\n'); // a textarea reads its value with \n, whatever line ends were stored

/** Is any field of the form different from what the page rendered in it? (the defaults are the saved values, a refresh renews them) */
export function isEdited(form: HTMLFormElement): boolean {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset') continue;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) return true; } else if (norm(el.value) !== norm(el.defaultValue)) return true;
    } else if (el instanceof HTMLTextAreaElement) {
      if (norm(el.value) !== norm(el.defaultValue)) return true;
    } else if (el instanceof HTMLSelectElement) {
      if (Array.from(el.options).some((o) => o.selected !== o.defaultSelected)) return true;
    }
  }
  return false;
}

/**
 * A button of a fiche form that can be greyed. It stays focusable (`aria-disabled`, not `disabled`: pressing « Enregistrer » would otherwise
 * drop the focus the moment it goes grey) and does nothing when pressed; `title` says why.
 * - kind « save »: lit only while its own form holds unsaved edits (or `unsaved`: something to store without any edit, as the sentence
 *   of a retained track that is still the AI hook shown as a starting point; but not while another form is being edited);
 * - kind « other »: greyed while any form of the scope is being edited;
 * - `locked` (with `lockedReason`): greyed whatever the edits, as « Choisir » before she has chosen.
 */
export function EditButton({ kind, locked, lockedReason, unsaved, litClassName, className, onClick, title, ...props }: ComponentProps<'button'> & {
  kind: 'save' | 'other'; locked?: boolean; lockedReason?: string; unsaved?: boolean;
  /** added to the class of a « save » button while it is lit (there is something to save) */
  litClassName?: string;
}) {
  const form = useContext(FormEditContext);
  const editing = useEditing();
  const reason = locked ? lockedReason ?? 'Indisponible pour le moment.'
    : kind === 'save' ? (!form || form.dirty || (unsaved && !editing) ? undefined : editing ? EDITING_REASON : NOTHING_TO_SAVE_REASON)
    : editing ? EDITING_REASON : undefined;
  return (
    <button
      {...props}
      className={kind === 'save' && !reason && litClassName ? `${className ?? ''} ${litClassName}`.trim() : className}
      title={reason ?? title}
      aria-disabled={reason ? true : undefined}
      onClick={(e) => {
        if (reason) { e.preventDefault(); return; }
        onClick?.(e);
      }}
    />
  );
}

/** « Annuler »: back to the saved values (shown only while the form holds edits). */
export function EditCancel({ children = 'Annuler' }: { children?: ReactNode }) {
  const form = useContext(FormEditContext);
  if (!form?.dirty) return null;
  return (
    <button
      type="button"
      className="a-link-btn"
      onClick={(e) => {
        e.currentTarget.form?.reset();
        window.dispatchEvent(new Event('resize')); // the growing boxes fit their text again
      }}
    >
      {children}
    </button>
  );
}
