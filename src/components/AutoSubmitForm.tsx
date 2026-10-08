'use client';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/**
 * A GET form that applies itself when a drop-down changes (a search field still waits for Enter).
 * The address stays clean: empty fields and values equal to `defaults` are left out. Without JavaScript it is a plain GET form.
 */
export function AutoSubmitForm({ children, action, defaults = {}, ...props }: ComponentProps<'form'> & { action: string; defaults?: Record<string, string> }) {
  const router = useRouter();
  return (
    <form
      {...props}
      action={action}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === 'SELECT') e.currentTarget.requestSubmit();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === 'string' && v && defaults[k] !== v) p.set(k, v);
        router.push(p.size ? `${action}?${p}` : action);
      }}
    >
      {children}
    </form>
  );
}
