'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type FormHTMLAttributes, type ReactNode } from 'react';
import { EditScopeContext, FormEditContext, isEdited } from './EditScope';

type Reply = { ok: boolean; msg: string };
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
  const scope = useContext(EditScopeContext);
  const formId = useId();
  const [dirty, setDirty] = useState(false);
  const check = useCallback(() => {
    const form = formRef.current;
    if (!watchEdits || !form) return;
    const now = isEdited(form);
    setDirty(now);
    scope?.setDirty(formId, now);
  }, [watchEdits, scope, formId]);
  // after every render: a refresh after « Enregistrer » renders the saved values as the new defaults, and the edits are gone
  useEffect(() => { check(); });
  useEffect(() => () => scope?.setDirty(formId, false), [scope, formId]);
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
