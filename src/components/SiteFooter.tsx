import type { Locale } from '@/lib/questions';
import { t } from '@/lib/i18n';

export function SiteFooter({ locale, ellipse = true }: { locale: Locale; ellipse?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        {ellipse && <div className="ellipse" aria-hidden="true" />}
        <p className="label-s muted" style={{ marginBottom: 8 }}>SHESPEAKS BY TECHIES CONNECT&apos;</p>
        <p className="small">{t(locale).home.footer}</p>
      </div>
    </footer>
  );
}
