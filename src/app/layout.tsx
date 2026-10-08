import type { Metadata, Viewport } from 'next';
import { getLocale } from '@/lib/locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: { default: "SheSpeaks by Techies Connect'", template: '%s · SheSpeaks' },
    description: locale === 'en'
      ? 'SheSpeaks supports young professionals and students in tech so they take the floor at tech events.'
      : 'SheSpeaks accompagne les jeunes professionnelles et les étudiantes de la tech pour qu’elles prennent la parole lors des événements tech.',
    robots: { index: true, follow: true },
  };
}
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
