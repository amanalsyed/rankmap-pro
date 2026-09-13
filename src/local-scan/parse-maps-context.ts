import { normalizeMapsText, parseLatLngFromText } from '../content/maps-id-utils';

/** Parse the Maps search keyword from the URL or page label. */
export function parseMapsSearchKeyword(url: string, pageLabel?: string | null): string {
  const normalized = normalizeMapsText(url);

  const searchMatch = normalized.match(/\/maps\/search\/([^/@?&]+)/i);
  if (searchMatch?.[1]) {
    return decodeURIComponent(searchMatch[1].replace(/\+/g, ' ')).trim();
  }

  try {
    const parsed = new URL(normalized, 'https://www.google.com');
    const q = parsed.searchParams.get('q') ?? parsed.searchParams.get('query');
    if (q?.trim()) return q.trim();
  } catch {
    // ignore
  }

  if (pageLabel) {
    const fromLabel = pageLabel.replace(/^Results for\s+/i, '').trim();
    if (fromLabel) return fromLabel;
  }

  return 'Local search';
}

/** Map viewport center from @lat,lng or ll= in the Maps URL. */
export function parseMapsSearchCenter(url: string): { lat: number | null; lng: number | null } {
  const normalized = normalizeMapsText(url);

  const atMatch = normalized.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  return parseLatLngFromText(normalized);
}
