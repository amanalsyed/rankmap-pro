import { decimalCidFromHexFid } from './place-id';

function absoluteMapsUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `https://www.google.com${url.startsWith('/') ? '' : '/'}${url}`;
}

/** True when a URL targets one business (place page or cid=), not a search feed. */
export function isAuditablePlaceUrl(mapsUrl: string): boolean {
  const absolute = absoluteMapsUrl(mapsUrl);
  if (!absolute.includes('google.com/maps')) return false;
  if (absolute.includes('/maps/place')) return true;
  if (/[?&]cid=\d+/i.test(absolute)) return true;
  if (/[?&]q=place_id:/i.test(absolute)) return true;
  return false;
}

/** Reliable Maps place URL for opening a specific business. */
export function normalizeMapsAuditUrl(mapsUrl: string, placeId: string): string {
  const absolute = absoluteMapsUrl(mapsUrl);
  // Prefer the full card URL — it loads the place panel faster than a bare place_id link.
  if (absolute.includes('/maps/place') || /[?&]cid=\d+/i.test(absolute)) return absolute;

  const chij = placeId.match(/(ChIJ[a-zA-Z0-9_-]{10,})/)?.[1];
  if (chij) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(chij)}`;
  }

  const cidFromPlace = placeId.match(/^cid:(\d+)$/i)?.[1];
  if (cidFromPlace) {
    return `https://www.google.com/maps?cid=${cidFromPlace}`;
  }

  if (/^0x[a-f0-9]+:0x[a-f0-9]+$/i.test(placeId)) {
    const decimalCid = decimalCidFromHexFid(placeId);
    if (decimalCid) return `https://www.google.com/maps?cid=${decimalCid}`;
  }

  // Never return bare /maps or /maps/search URLs — they won't expose place hours.
  return '';
}
