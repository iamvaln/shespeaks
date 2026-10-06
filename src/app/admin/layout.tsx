import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Espace coach', robots: { index: false, follow: false } };
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin-root" data-theme="clair">{children}</div>;
}
