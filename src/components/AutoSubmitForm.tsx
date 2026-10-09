'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ComponentProps } from 'react';

/**
 * A GET form that applies itself when a drop-down changes (a search field still waits for Enter).
 * With the keyboard, ArrowDown on a closed drop-down changes its value at every press: the form then waits for a pause
 * (700 ms) instead of loading a page per key. The address stays clean: empty fields and values equal to `defaults`
 * are left out. Without JavaScript it is a plain GET form.
 */
export function AutoSubmitForm({ children, action, defaults = {}, ...props }: ComponentProps<'form'> & { action: string; defaults?: Record<string, string> }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const keyboard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <form
      {...props}
      ref={form}
      action={action}
      onKeyDown={() => { keyboard.current = true; }}
      onPointerDown={() => { keyboard.current = false; }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName !== 'SELECT') return;
        clearTimeout(timer.current);
        if (keyboard.current) timer.current = setTimeout(() => form.current?.requestSubmit(), 700);
        else form.current?.requestSubmit();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        const p = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === 'string' && v && defaults[k] !== v) p.set(k, v);
        const qs = p.toString();
        router.push(qs ? `${action}?${qs}` : action);
      }}
    >
      {children}
    </form>
  );
}
