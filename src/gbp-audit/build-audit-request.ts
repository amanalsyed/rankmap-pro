import {
  buildMapsUrlFromCid,
  decimalCidFromHexFid,
  extractDecimalCidFromUrl,
  extractHexFidFromCard,
  extractHexFidFromUrl,
  extractPlaceId,
  getPlaceLink,
  resolveListingPlaceId,
} from '../content/dom-utils';
import { extractLeadFromCard, getAbsoluteMapsUrl } from '../content/website-detector';
import { isAuditablePlaceUrl, normalizeMapsAuditUrl } from './maps-url';
import type { StandaloneGbpAuditRequest } from './types';

/** Build a standalone audit request from a Maps/Search listing card — same as GBP Audit button. */
export function buildAuditRequestFromListingCard(
  card: HTMLElement,
  overrides: {
    placeId?: string;
    name?: string;
    address?: string;
    phone?: string;
    kgMid?: string;
    mapsUrl?: string;
  } = {}
): StandaloneGbpAuditRequest | null {
  const href = getPlaceLink(card)?.getAttribute('href') ?? '';
  const placeId = overrides.placeId || extractPlaceId(href) || resolveListingPlaceId(card);
  if (!placeId) return null;

  const hexFid = extractHexFidFromCard(card) ?? extractHexFidFromUrl(href);
  const decimalCid =
    extractDecimalCidFromUrl(href) ??
    extractDecimalCidFromUrl(overrides.mapsUrl ?? '') ??
    card.getAttribute('data-cid') ??
    card.closest('[data-cid]')?.getAttribute('data-cid') ??
    decimalCidFromHexFid(hexFid);

  const rawMapsUrl =
    overrides.mapsUrl ||
    getAbsoluteMapsUrl(href) ||
    buildMapsUrlFromCid(decimalCid);
  const mapsUrl = normalizeMapsAuditUrl(rawMapsUrl, placeId);
  if (!mapsUrl || !isAuditablePlaceUrl(mapsUrl)) return null;

  const lead = extractLeadFromCard(card, placeId, null);
  const kgMid = overrides.kgMid?.trim();

  return {
    placeId,
    name: overrides.name || lead?.name || 'Unknown Business',
    mapsUrl,
    address: overrides.address ?? lead?.address ?? '',
    phone: overrides.phone ?? lead?.phone ?? '',
    category: lead?.category,
    rating: lead?.rating,
    reviews: lead?.reviews,
    kgMid: kgMid || undefined,
  };
}
