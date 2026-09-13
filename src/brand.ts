/** User-facing product name and copy — single source of truth for the rebrand. */
export const PRODUCT_NAME = 'RankMap Pro';

export const PRODUCT_TAGLINE = 'Local SEO tools for Google Maps';

export const PRODUCT_SUBTITLE =
  'Check rankings, audit GBP profiles, scan competitors, and find businesses without websites.';

/** Chrome Web Store / manifest short description. */
export const PRODUCT_DESCRIPTION =
  'Rank check, GBP audit, local competitor scans, and no-website lead finder for Google Maps.';

/** Extension icon shown in headers (popup, dashboard, etc.). */
export const BRAND_ICON_PATH = 'public/icons/icon48.png';

export function getBrandIconUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(BRAND_ICON_PATH);
  }
  return `/${BRAND_ICON_PATH}`;
}

export function pageTitle(suffix?: string): string {
  if (!suffix) return PRODUCT_NAME;
  return `${PRODUCT_NAME} — ${suffix}`;
}
