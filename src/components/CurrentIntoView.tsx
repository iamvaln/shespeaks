'use client';
import { useEffect, useRef, type ComponentProps } from 'react';

/** A row of tabs that scrolls sideways on a phone: the current tab is brought into view when the page loads. */
export function CurrentIntoView({ children, ...props }: ComponentProps<'nav'>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const left = el.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollTo({ left: left - (nav.clientWidth - el.offsetWidth) / 2 });
  });
  return <nav ref={ref} {...props}>{children}</nav>;
}
