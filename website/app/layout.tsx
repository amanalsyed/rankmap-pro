import type { Metadata } from 'next';
import ConditionalSiteChrome from '@/components/ConditionalSiteChrome';
import { SITE } from '@/content/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Local SEO on Google Maps`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    'local SEO',
    'Google Maps',
    'GBP audit',
    'rank check',
    'lead finder',
    'Chrome extension',
  ],
  openGraph: {
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.name,
    description: SITE.description,
  },
  alternates: {
    canonical: SITE.url,
  },
  icons: {
    icon: '/icons/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConditionalSiteChrome>{children}</ConditionalSiteChrome>
      </body>
    </html>
  );
}
