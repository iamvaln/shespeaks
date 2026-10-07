import Link from 'next/link';
import { LangSwitch } from '@/components/LangSwitch';
import { getLocale } from '@/lib/locale';
import { t } from '@/lib/i18n';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const d = t(locale);
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link href="/" aria-label="SheSpeaks by Techies Connect'">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/shespeaks-logo-nuit.svg" alt="SheSpeaks by Techies Connect'" width={108} height={44} />
          </Link>
          <LangSwitch locale={locale} />
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div className="ellipse" aria-hidden="true" />
          <p className="label-s muted" style={{ marginBottom: 8 }}>SHESPEAKS BY TECHIES CONNECT&apos;</p>
          <p className="small">{d.home.footer}</p>
        </div>
      </footer>
    </>
  );
}
