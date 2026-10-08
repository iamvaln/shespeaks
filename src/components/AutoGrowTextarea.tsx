'use client';
import { useEffect, useRef, type ComponentProps } from 'react';

/** A one-line box that grows with its text: a long title stays readable, also where CSS field-sizing is not supported. */
export function AutoGrowTextarea({ onInput, ...props }: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return <textarea {...props} ref={ref} rows={1} onInput={(e) => { fit(); onInput?.(e); }} />;
}
