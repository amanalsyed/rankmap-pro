'use client';

import { GoogleAnalytics } from '@next/third-parties/google';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';

/** Production GA4 — excluded from /admin and local dev. */
export default function SiteGoogleAnalytics() {
  const pathname = usePathname();

  if (!isAnalyticsEnabled()) return null;
  if (pathname?.startsWith('/admin')) return null;

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
