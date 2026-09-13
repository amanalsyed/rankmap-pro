import { parsePlacePinLatLng, parsePlaceUrlLatLng } from './maps-id-utils';
import type { IdentifierLookupMaps } from './maps-identifiers-bridge';
import {
  fetchIdentifiersForListing,
  lookupIdentifiersFromCache,
} from './maps-identifiers-bridge';

export interface ListingCoordinateKeys {
  hexFid: string | null;
  placeId: string | null;
  chij: string | null;
  decimalCid: string | null;
}

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

/** Scan card place links for !3d pin coords embedded in href data blobs. */
export function extractLatLngFromCard(card: Element): LatLng {
  for (const link of card.querySelectorAll('a[href*="/maps/place/"], a[href*="!3d"]')) {
    const href = link.getAttribute('href') ?? '';
    const pin = parsePlacePinLatLng(href);
    if (pin.lat != null && pin.lng != null) return pin;

    const fromPlace = parsePlaceUrlLatLng(href);
    if (fromPlace.lat != null && fromPlace.lng != null) return fromPlace;
  }
  return { lat: null, lng: null };
}

function normalizeLatLng(source: LatLng | null | undefined): LatLng | null {
  if (source?.lat == null || source?.lng == null) return null;
  if (!Number.isFinite(source.lat) || !Number.isFinite(source.lng)) return null;
  return { lat: source.lat, lng: source.lng };
}

/**
 * Resolve listing coordinates.
 * Priority: place URL pin (!3d!4d) → card link pin → per-listing JSPB → bulk cache.
 */
export async function resolveListingCoordinates(
  keys: ListingCoordinateKeys,
  options: {
    placeUrl?: string | null;
    card?: Element | null;
    identifierMaps?: IdentifierLookupMaps | null;
    timeoutMs?: number;
  } = {}
): Promise<LatLng> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const listingPlaceId = keys.chij ?? keys.placeId;

  if (options.placeUrl) {
    const fromUrl = normalizeLatLng(parsePlaceUrlLatLng(options.placeUrl));
    if (fromUrl) return fromUrl;
  }

  if (options.card) {
    const fromCard = normalizeLatLng(extractLatLngFromCard(options.card));
    if (fromCard) return fromCard;
  }

  const fetched = await fetchIdentifiersForListing(keys.hexFid, listingPlaceId, {
    decimalCid: keys.decimalCid,
    bypassBulkCache: true,
    timeoutMs,
  });
  if (fetched?.lat != null && fetched.lng != null) {
    return { lat: fetched.lat, lng: fetched.lng };
  }

  if (options.identifierMaps) {
    const cached = lookupIdentifiersFromCache(
      options.identifierMaps,
      keys.hexFid,
      listingPlaceId,
      keys.decimalCid
    );
    if (cached?.lat != null && cached.lng != null) {
      return { lat: cached.lat, lng: cached.lng };
    }
  }

  return { lat: null, lng: null };
}

/** Sync-only coordinate lookup for Quick Scan (no per-listing JSPB fetch). */
export function resolveQuickScanCoordinates(
  keys: ListingCoordinateKeys,
  options: {
    placeUrl?: string | null;
    card?: Element | null;
    identifierMaps?: IdentifierLookupMaps | null;
  } = {}
): LatLng {
  const listingPlaceId = keys.chij ?? keys.placeId;

  if (options.placeUrl) {
    const fromUrl = normalizeLatLng(parsePlaceUrlLatLng(options.placeUrl));
    if (fromUrl) return fromUrl;
  }

  if (options.card) {
    const fromCard = normalizeLatLng(extractLatLngFromCard(options.card));
    if (fromCard) return fromCard;
  }

  if (options.identifierMaps) {
    const cached = lookupIdentifiersFromCache(
      options.identifierMaps,
      keys.hexFid,
      listingPlaceId,
      keys.decimalCid
    );
    if (cached?.lat != null && cached.lng != null) {
      return { lat: cached.lat, lng: cached.lng };
    }
  }

  return { lat: null, lng: null };
}

/** Pick the best coordinates from multiple sources (URL pin wins over JSPB). */
export function pickBestCoordinates(
  sources: Array<LatLng | null | undefined>,
  placeUrls: Array<string | null | undefined> = []
): LatLng {
  for (const url of placeUrls) {
    if (!url) continue;
    const fromUrl = normalizeLatLng(parsePlaceUrlLatLng(url));
    if (fromUrl) return fromUrl;
  }

  for (const source of sources) {
    const normalized = normalizeLatLng(source);
    if (normalized) return normalized;
  }

  return { lat: null, lng: null };
}

/** Read pin coords from the open detail panel URL after deep scan. */
export function readOpenPanelCoordinates(): LatLng {
  return normalizeLatLng(parsePlaceUrlLatLng(window.location.href)) ?? { lat: null, lng: null };
}
