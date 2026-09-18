export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

/** GA loads only on production builds with a measurement ID configured. */
export function isAnalyticsEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  return Boolean(GA_MEASUREMENT_ID);
}

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
  }
}

export function trackEvent(eventName: string, params?: Record<string, string>): void {
  if (typeof window === 'undefined' || !isAnalyticsEnabled()) return;
  window.gtag?.('event', eventName, params);
}

export function trackInstallClick(location: string): void {
  trackEvent('install_click', { location });
}

export function trackCheckoutClick(location: string): void {
  trackEvent('checkout_click', { location });
}

export function trackContactSubmit(): void {
  trackEvent('contact_submit', { location: 'contact_form' });
}
