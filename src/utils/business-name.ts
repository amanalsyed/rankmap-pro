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

const RANK_CHECK_JUNK_LABEL =
  /^(?:popular times|overview|reviews|about|photos|updates|directions|save|share|nearby|order online|website)$/i;

const RANK_CHECK_GLUED_UI_RE =
  /see photos|\d\.\d\s*\([\d,]+\)|\breviews?\b|\bopen now\b|\bclosed\b/i;

/** Maps tab labels and glued card text should never become the rank-check title. */
export function cleanRankCheckBusinessName(value: string): string {
  let name = cleanBusinessName(value.replace(/\s+/g, ' ').trim());
  if (!name || RANK_CHECK_JUNK_LABEL.test(name)) return '';

  if (RANK_CHECK_GLUED_UI_RE.test(name)) {
    name = cleanBusinessName(name.split(/see photos/i)[0] ?? name);
    name = cleanBusinessName(name.split(/\d\.\d\s*\(/)[0] ?? name);
  }

  const segments = name
    .split(/\s*[·•|]\s*/)
    .map((part) => cleanBusinessName(part))
    .filter((part) => part && !RANK_CHECK_JUNK_LABEL.test(part) && !RANK_CHECK_GLUED_UI_RE.test(part));

  if (segments.length > 1) {
    name = segments.sort((a, b) => b.length - a.length)[0] ?? name;
  }

  name = cleanBusinessName(name);
  if (!name || RANK_CHECK_JUNK_LABEL.test(name)) return '';
  if (name.length > 120) return cleanBusinessName(name.slice(0, 120));

  return name;
}

/** Drop listing-card blobs that sometimes get mistaken for an address. */
export function cleanRankCheckAddress(value: string): string {
  const address = value.replace(/\s+/g, ' ').trim();
  if (!address) return '';
  if (RANK_CHECK_JUNK_LABEL.test(address)) return '';
  if (RANK_CHECK_GLUED_UI_RE.test(address)) return '';
  if (address.length > 200) return '';
  if (!/[,\d]/.test(address) && address.length > 80) return '';
  return address;
}

export function normalizeBusinessAgeLabel(value: string): string {
  const match = value.replace(/\s+/g, ' ').trim().match(/(\d+\+?\s*years?\s+in\s+business)/i);
  return match?.[1] ?? '';
}
