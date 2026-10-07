import type { Metadata, Viewport } from 'next';
import { getLocale } from '@/lib/locale';
import './globals.css';

export const metadata: Metadata = {
  title: { default: "SheSpeaks by Techies Connect'", template: "%s · SheSpeaks" },
  description: 'SheSpeaks accompagne des femmes de la tech au Cameroun jusqu’à la scène des DevFest. · SheSpeaks supports women in tech in Cameroon all the way to the DevFest stage.',
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#111528' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme="nuit">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
