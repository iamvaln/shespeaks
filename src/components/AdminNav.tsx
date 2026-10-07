'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/admin', 'Tableau de bord'],
  ['/admin/candidates', 'Candidates'],
  ['/admin/events', 'Calendrier DevFest'],
  ['/admin/coaches', 'Coachs'],
  ['/admin/settings', 'Paramètres'],
  ['/admin/emails', 'Emails'],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Navigation admin">
      {ITEMS.map(([href, label]) => {
        const active = href === '/admin' ? path === '/admin' : path.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
