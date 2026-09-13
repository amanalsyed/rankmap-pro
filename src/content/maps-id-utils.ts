/** Normalize Google Maps URL/text blobs before identifier parsing. */
export function normalizeMapsText(text: string): string {
  let value = text;
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw text
  }

  return value
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u003f/gi, '?')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u0025/gi, '%')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0022/gi, '"');
}

/** Return a clean ChIJ Place ID or null if the value is not a valid Place ID. */
export function sanitizePlaceId(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = normalizeMapsText(String(value).trim());
  const match = normalized.match(/(ChIJ[a-zA-Z0-9_-]{10,})/);
  if (!match) return null;

  const placeId = match[1];
  return /^ChIJ[a-zA-Z0-9_-]{10,}$/.test(placeId) ? placeId : null;
}

/** Return a clean Knowledge Graph ID such as /g/... or /m/... */
export function sanitizeKnowledgeGraphId(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = normalizeMapsText(String(value).trim());
  const match =
    normalized.match(/(\/[gm]\/[a-z0-9_-]+)/i) ??
    normalized.match(/kgmid=(\/?[gm]\/[^&\s"']+)/i);
  if (!match) return null;

  let kg = match[1];
  if (!kg.startsWith('/')) kg = `/${kg}`;
  return kg.match(/^\/[gm]\/[a-z0-9_-]+$/i) ? kg : null;
}

export function isLikelyPlaceUrl(url: string): boolean {
  const text = normalizeMapsText(url);
  return (
    /\/maps\/place\//i.test(text) ||
    /[?&](?:query_)?place_id=ChIJ/i.test(text) ||
    /place_id:ChIJ/i.test(text) ||
    /!19sChIJ/i.test(text) ||
    /!1s0x[a-f0-9]+:0x[a-f0-9]+/i.test(text)
  );
}

export function parseLatLngFromText(text: string): { lat: number | null; lng: number | null } {
  const pin = parsePlacePinLatLng(text);
  if (pin.lat != null && pin.lng != null) return pin;

  const normalized = normalizeMapsText(text);

  const llParam = normalized.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (llParam) {
    return { lat: parseFloat(llParam[1]), lng: parseFloat(llParam[2]) };
  }

  const atMatch = normalized.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  return { lat: null, lng: null };
}

/** Place pin from !3dLAT!4dLNG — the exact business location in Maps place URLs. */
export function parsePlacePinLatLng(text: string): { lat: number | null; lng: number | null } {
  const normalized = normalizeMapsText(text);
  const precise = [...normalized.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/gi)];
  if (precise.length === 0) return { lat: null, lng: null };

  const last = precise[precise.length - 1];
  return { lat: parseFloat(last[1]), lng: parseFloat(last[2]) };
}

/** Lat/lng for a listing: prefer !3d pin, then @ coords on /maps/place/ URLs only. */
export function parsePlaceUrlLatLng(text: string): { lat: number | null; lng: number | null } {
  const pin = parsePlacePinLatLng(text);
  if (pin.lat != null && pin.lng != null) return pin;

  const normalized = normalizeMapsText(text);
  if (!/\/maps\/place\//i.test(normalized)) return { lat: null, lng: null };

  const atMatch = normalized.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  return { lat: null, lng: null };
}
