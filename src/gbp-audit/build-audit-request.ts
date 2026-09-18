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
import { extractMapsIdentifiersAsync } from '../content/maps-identifiers';
import {
  fetchIdentifierByKgMid,
  fetchIdentifiersForListing,
} from '../content/maps-identifiers-bridge';
import { extractLeadFromCard, getAbsoluteMapsUrl } from '../content/website-detector';
import { isAuditablePlaceUrl, normalizeMapsAuditUrl } from './maps-url';
import { normalizeStandalonePlaceId } from './place-id';
import type { StandaloneGbpAuditRequest } from './types';

type AuditOverrides = {
  placeId?: string;
  name?: string;
  address?: string;
  phone?: string;
  kgMid?: string;
  mapsUrl?: string;
};

function canBuildAuditMapsUrl(placeId: string): boolean {
  const clean = normalizeStandalonePlaceId(placeId);
  if (!clean) return false;
  return Boolean(normalizeMapsAuditUrl('', clean));
}

/** Prefer ChIJ / cid / hex ids over weak keys such as `name:` or `/url` stubs. */
function pickAuditablePlaceId(...candidates: (string | undefined)[]): string {
  for (const id of candidates) {
    const trimmed = id?.trim();
    if (trimmed && canBuildAuditMapsUrl(trimmed)) return trimmed;
  }
  for (const id of candidates) {
    const trimmed = id?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

interface CardMapsHints {
  href: string;
  placeId: string | null;
  hexFid: string | null;
  decimalCid: string | null;
}

/** Scan every link on a listing card — Search often hides the place URL on a Directions anchor. */
function collectMapsHintsFromCard(card: HTMLElement): CardMapsHints {
  let bestHref = '';
  let bestPlaceId: string | null = null;
  let hexFid = extractHexFidFromCard(card);
  let decimalCid =
    card.getAttribute('data-cid') ??
    card.getAttribute('data-rc_ludocids') ??
    card.closest('[data-cid]')?.getAttribute('data-cid') ??
    card.closest('[data-rc_ludocids]')?.getAttribute('data-rc_ludocids') ??
    null;

  for (const el of card.querySelectorAll('a[href], [data-url]')) {
    const raw = el.getAttribute('href') ?? el.getAttribute('data-url') ?? '';
    if (!raw) continue;

    if (!hexFid) hexFid = extractHexFidFromUrl(raw);
    if (!decimalCid) decimalCid = extractDecimalCidFromUrl(raw);

    const absolute = getAbsoluteMapsUrl(raw);
    const pid = extractPlaceId(raw) ?? extractPlaceId(absolute);
    if (!pid || !canBuildAuditMapsUrl(pid)) continue;

    if (absolute && isAuditablePlaceUrl(absolute)) {
      bestHref = absolute;
      bestPlaceId = pid;
      break;
    }

    if (!bestPlaceId) bestPlaceId = pid;
  }

  if (!decimalCid && hexFid) {
    decimalCid = decimalCidFromHexFid(hexFid);
  }

  const primaryHref = getPlaceLink(card)?.getAttribute('href') ?? '';
  if (!bestHref && primaryHref) {
    const absolute = getAbsoluteMapsUrl(primaryHref);
    if (absolute && isAuditablePlaceUrl(absolute)) bestHref = absolute;
  }

  if (!bestPlaceId) {
    const fromPrimary = extractPlaceId(primaryHref);
    if (fromPrimary && canBuildAuditMapsUrl(fromPrimary)) bestPlaceId = fromPrimary;
  }

  return { href: bestHref, placeId: bestPlaceId, hexFid, decimalCid };
}

function requestFromHints(
  card: HTMLElement,
  hints: CardMapsHints,
  overrides: AuditOverrides
): StandaloneGbpAuditRequest | null {
  const fromCard =
    hints.placeId ??
    (hints.hexFid && canBuildAuditMapsUrl(hints.hexFid) ? hints.hexFid : null) ??
    (hints.decimalCid ? `cid:${hints.decimalCid}` : null) ??
    resolveListingPlaceId(card);
  const placeId = pickAuditablePlaceId(fromCard, overrides.placeId);
  if (!placeId) return null;

  const rawMapsUrl =
    overrides.mapsUrl ||
    hints.href ||
    getAbsoluteMapsUrl(getPlaceLink(card)?.getAttribute('href') ?? '') ||
    buildMapsUrlFromCid(hints.decimalCid);
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

function requestFromIdentifierRecord(
  card: HTMLElement,
  record: { hexFid: string; placeId: string | null; cid: string | null },
  overrides: AuditOverrides
): StandaloneGbpAuditRequest | null {
  const placeId = pickAuditablePlaceId(
    record.placeId ?? undefined,
    record.hexFid,
    record.cid ? `cid:${record.cid}` : undefined,
    overrides.placeId
  );
  const rawMapsUrl =
    overrides.mapsUrl ||
    buildMapsUrlFromCid(record.cid) ||
    normalizeMapsAuditUrl('', placeId);

  return requestFromHints(
    card,
    {
      href: rawMapsUrl,
      placeId: placeId || null,
      hexFid: record.hexFid,
      decimalCid: record.cid,
    },
    { ...overrides, placeId: placeId || overrides.placeId, mapsUrl: rawMapsUrl || overrides.mapsUrl }
  );
}

/** Build a standalone audit request from a Maps/Search listing card — same as GBP Audit button. */
export function buildAuditRequestFromListingCard(
  card: HTMLElement,
  overrides: AuditOverrides = {}
): StandaloneGbpAuditRequest | null {
  return requestFromHints(card, collectMapsHintsFromCard(card), overrides);
}

/** Async fallback for Google Search cards whose Maps ids live in page state, not hrefs. */
export async function buildAuditRequestFromListingCardAsync(
  card: HTMLElement,
  overrides: AuditOverrides = {}
): Promise<StandaloneGbpAuditRequest | null> {
  const sync = buildAuditRequestFromListingCard(card, overrides);
  if (sync?.mapsUrl) return sync;

  const kgMid = overrides.kgMid?.trim();
  if (kgMid) {
    const fromKg = await fetchIdentifierByKgMid(kgMid, 8000);
    if (fromKg) {
      const fromKgMid = requestFromIdentifierRecord(card, fromKg, overrides);
      if (fromKgMid?.mapsUrl) return fromKgMid;
    }
  }

  const hints = collectMapsHintsFromCard(card);
  const ids = await extractMapsIdentifiersAsync(card);

  const hexFid = hints.hexFid ?? ids.hexFid;
  const chij = ids.placeId?.startsWith('ChIJ') ? ids.placeId : hints.placeId;
  const decimalCid = hints.decimalCid ?? ids.cid;

  const enriched = await fetchIdentifiersForListing(hexFid, chij, {
    decimalCid,
    timeoutMs: 8000,
  });

  if (enriched) {
    const fromState = requestFromIdentifierRecord(card, enriched, overrides);
    if (fromState?.mapsUrl) return fromState;
  }

  const resolvedPlaceId = pickAuditablePlaceId(
    chij ?? undefined,
    hexFid ?? undefined,
    decimalCid ? `cid:${decimalCid}` : undefined,
    overrides.placeId
  );

  const resolvedCid = decimalCid ?? enriched?.cid ?? null;
  const rawMapsUrl =
    overrides.mapsUrl ||
    hints.href ||
    buildMapsUrlFromCid(resolvedCid) ||
    (resolvedPlaceId ? normalizeMapsAuditUrl('', resolvedPlaceId) : '');

  return requestFromHints(
    card,
    {
      href: rawMapsUrl,
      placeId: resolvedPlaceId || null,
      hexFid,
      decimalCid: resolvedCid,
    },
    { ...overrides, placeId: resolvedPlaceId || overrides.placeId, mapsUrl: rawMapsUrl || overrides.mapsUrl }
  );
}
