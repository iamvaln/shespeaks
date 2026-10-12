'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type FormHTMLAttributes, type ReactNode } from 'react';
import { EditScopeContext, FormEditContext, isEdited } from './EditScope';

type Reply = { ok: boolean; msg: string };
/** What the fields hold, as the form would send it (the submit button apart). */
const fieldsOf = (form: HTMLFormElement) => JSON.stringify(Array.from(new FormData(form)));
/** Lets PendingButton know an InlineForm is running (useFormStatus only sees forms submitted through their `action`). */
export const InlinePending = createContext<{ pending: boolean; data: FormData | null } | null>(null);

/**
 * A fiche form that runs its server action without leaving the page: no reload, no jump to the top, and what the coach typed in the
 * other forms stays as it is (a redirect to the same page with a new ?msg= remounted the whole page and lost it). The action answers
 * { ok, msg }, shown next to the form; the page data refreshes in place. The coach space needs JavaScript for this form.
 */
export function InlineForm({ action, children, resetOnSuccess, watchEdits, ...props }: {
  action: (f: FormData) => Promise<Reply | void>; children: ReactNode; resetOnSuccess?: boolean;
  /** Reports to the nearest EditScope whether the form holds unsaved edits (what differs from the saved values it was rendered with). */
  watchEdits?: boolean;
} & Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit' | 'onInput' | 'onChange' | 'onReset'>) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<FormData | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const sent = useRef<string | null>(null); // the fields as the last successful save sent them (watched forms only)
  const report = useContext(EditScopeContext)?.setDirty; // stable for the life of the scope (the scope object itself changes with every edit)
  const formId = useId();
  const [dirty, setDirty] = useState(false);
  const check = useCallback(() => {
    const form = formRef.current;
    if (!watchEdits || !form) return;
    const now = isEdited(form);
    setDirty(now);
    report?.(formId, now);
  }, [watchEdits, report, formId]);
  // after every render: a refresh after « Enregistrer » renders the saved values as the new defaults, and the edits are gone
  useEffect(() => { check(); });
  // saved: the server keeps its own version of what was typed (trimmed, one line, no blank steps, the hook again when the sentence was
  // emptied), and the refresh renders it as the new defaults. A field the coach has not touched since takes it too, or the form would
  // read « edited » for good and its block stay greyed.
  useEffect(() => {
    const form = formRef.current, saved = sent.current;
    if (pending || saved === null || !form) return;
    sent.current = null;
    if (fieldsOf(form) !== saved) return; // typed again since: those are new edits
    form.reset();
    window.dispatchEvent(new Event('resize')); // the growing boxes fit their text again
    check();
  }, [pending, check]);
  useEffect(() => () => report?.(formId, false), [report, formId]); // gone (the track was removed, or became locked): it no longer holds edits
  return (
    <InlinePending.Provider value={{ pending, data }}>
      <FormEditContext.Provider value={watchEdits ? { dirty } : null}>
      <form
        {...props}
        ref={formRef}
        onInput={check}
        onChange={check}
        onReset={() => setTimeout(check, 0)} // the event fires before the fields are put back
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const form = e.currentTarget;
          const typed = watchEdits ? fieldsOf(form) : null;
          const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter);
          fd.set('_inline', '1');
          setData(fd);
          setReply(null);
          clearTimeout(timer.current);
          start(async () => {
            const r = await action(fd);
            if (!r) return;
            setReply(r);
            if (r.ok && resetOnSuccess) form.reset();
            if (r.ok) sent.current = typed;
            if (r.ok) timer.current = setTimeout(() => setReply(null), 6000);
          });
        }}
      >
        {children}
        {reply && <p className={`a-inline-msg${reply.ok ? '' : ' is-err'}`} role={reply.ok ? 'status' : 'alert'}>{reply.msg}</p>}
      </form>
      </FormEditContext.Provider>
    </InlinePending.Provider>
  );
}
