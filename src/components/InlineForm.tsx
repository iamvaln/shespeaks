'use client';
import { createContext, useRef, useState, useTransition, type FormHTMLAttributes, type ReactNode } from 'react';

type Reply = { ok: boolean; msg: string };
/** Lets PendingButton know an InlineForm is running (useFormStatus only sees forms submitted through their `action`). */
export const InlinePending = createContext<{ pending: boolean; data: FormData | null } | null>(null);

/**
 * A fiche form that runs its server action without leaving the page: no reload, no jump to the top, and what the coach typed in the
 * other forms stays as it is (a redirect to the same page with a new ?msg= remounted the whole page and lost it). The action answers
 * { ok, msg }, shown next to the form; the page data refreshes in place. The coach space needs JavaScript for this form.
 */
export function InlineForm({ action, children, resetOnSuccess, ...props }: {
  action: (f: FormData) => Promise<Reply | void>; children: ReactNode; resetOnSuccess?: boolean;
} & Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'>) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<FormData | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <InlinePending.Provider value={{ pending, data }}>
      <form
        {...props}
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
    </InlinePending.Provider>
  );
}
