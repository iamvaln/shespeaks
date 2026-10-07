import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getLocale } from '@/lib/locale';

// The form and the roadmap use the light theme: a regular, readable form (the night theme stays for the landing).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <div className="themed-root" data-theme="clair">
      <SiteHeader locale={locale} variant="app" />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} ellipse={false} />
    </div>
  );
}
