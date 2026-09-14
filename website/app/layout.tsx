import type { Metadata } from 'next';
import ConditionalSiteChrome from '@/components/ConditionalSiteChrome';
import { SEO, SITE } from '@/content/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SEO.title,
    template: `%s | ${SITE.name}`,
  },
  description: SEO.description,
  keywords: [
    'local SEO',
    'Google Maps',
    'GBP audit',
    'Google Business Profile',
    'rank check',
    'lead finder',
    'no website leads',
    'Chrome extension',
    'local SEO tools',
  ],
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  openGraph: {
    title: SEO.title,
    description: SEO.description,
    url: SITE.url,
    siteName: SITE.name,
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: SEO.ogImage,
        width: SEO.ogImageWidth,
        height: SEO.ogImageHeight,
        alt: SEO.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO.title,
    description: SEO.description,
    images: [SEO.ogImage],
  },
  alternates: {
    canonical: SITE.url,
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
  robots: {
    index: true,
    follow: true,
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
