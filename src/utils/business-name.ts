const MAPS_METADATA_PATTERN =
  /\b(\d[\d,.]*\s*stars?|\([\d,]+\)|\breviews?\b|open now|closed|opens|closes|\$\$+|temporarily closed|permanently closed)/i;

/** Google Ads control shown on sponsored local-pack listings. */
const GOOGLE_AD_UI_TEXT_RE = /^my ad centr[ea]$/i;
const GOOGLE_AD_UI_SUFFIX_RE = /\s+my ad centr[ea]\s*$/i;

/** Remove the "My Ad Centre" link Google injects into sponsored listing titles. */
export function stripGoogleAdUiNodes(root: ParentNode): void {
  root.querySelectorAll('a, span, div, button, [role="link"]').forEach((node) => {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (GOOGLE_AD_UI_TEXT_RE.test(text)) node.remove();
  });
}

/** Remove Google Maps UI suffixes (middle dots, ratings, etc.) from a business name. */
export function cleanBusinessName(value: string): string {
  if (!value) return '';

  let cleaned = value
    .replace(/\bvisited link\b/gi, ' ')
    .replace(/\bvisited\b/gi, ' ')
    .replace(GOOGLE_AD_UI_SUFFIX_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // aria-labels often look like: "Business Name · 4.5 stars · Category"
  const segments = cleaned.split(/\s*[·•|]\s*/);
  if (segments.length > 1) {
    const first = segments[0].trim();
    const remainder = segments.slice(1).join(' · ').trim();
    if (first && (!remainder || MAPS_METADATA_PATTERN.test(remainder))) {
      cleaned = first;
    }
  }

  // Trailing separator only, e.g. "Business Name ·"
  cleaned = cleaned.replace(/[\s·•|,;:–—-]+$/g, '').trim();

  return cleaned;
}
