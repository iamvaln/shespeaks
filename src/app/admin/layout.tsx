import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: { default: 'Espace coach · SheSpeaks', template: '%s · Espace coach · SheSpeaks' },
  robots: { index: false, follow: false },
};
// The coach space is French only, whatever language the visitor chose on the public site.
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin-root" data-theme="clair" lang="fr">{children}</div>;
}
