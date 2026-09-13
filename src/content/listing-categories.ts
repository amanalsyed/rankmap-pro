import type { BusinessCategories, CategoryLookupMaps } from './maps-categories-bridge';
import {
  fetchCategoriesForListing,
  lookupCategoriesFromCache,
} from './maps-categories-bridge';
import {
  CATEGORY_ATTR,
  CATEGORY_PANEL_ATTR,
  CATEGORY_SIGNATURE_ATTR,
} from './maps-gmb-categories-ui';
import { sleep } from './dom-utils';

export interface ListingCategoryKeys {
  placeId: string;
  hexFid: string | null;
  chij: string | null;
  decimalCid: string | null;
}

export function parseCategorySignature(signature: string): BusinessCategories | null {
  const parts = signature
    .split('\u001f')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return {
    primary: parts[0],
    secondary: parts.slice(1),
  };
}

function normalizeCategories(categories: BusinessCategories): BusinessCategories {
  const primary = categories.primary.trim();
  const secondary = (categories.secondary ?? [])
    .map((name) => name.trim())
    .filter((name) => name && name !== primary);
  return { primary, secondary };
}

/**
 * Read the currently-visible detail panel categories injected by
 * maps-gbp-detail-categories.ts. Only one panel is open at a time so we
 * don't need placeId matching.
 */
export function readDetailPanelCategories(): BusinessCategories | null {
  const row = document.querySelector(`[${CATEGORY_PANEL_ATTR}="1"][${CATEGORY_SIGNATURE_ATTR}]`);
  const signature = row?.getAttribute(CATEGORY_SIGNATURE_ATTR);
  if (!signature) return null;
  return parseCategorySignature(signature);
}

/**
 * Read categories injected on a search-result card by maps-gbp-audit-button.
 */
export function readCardCategories(placeId: string): BusinessCategories | null {
  if (!placeId) return null;
  const selector = `[${CATEGORY_ATTR}="${CSS.escape(placeId)}"]:not([${CATEGORY_PANEL_ATTR}])`;
  const row = document.querySelector(selector);
  const signature = row?.getAttribute(CATEGORY_SIGNATURE_ATTR);
  if (!signature) return null;
  return parseCategorySignature(signature);
}

/**
 * Resolve categories for a Quick Scan card.
 * Priority: card pill injection → bulk JSPB cache → per-listing JSPB fetch.
 */
export async function resolveCardCategories(
  keys: ListingCategoryKeys,
  options: {
    cacheMaps?: CategoryLookupMaps | null;
    timeoutMs?: number;
  } = {}
): Promise<BusinessCategories | null> {
  const timeoutMs = options.timeoutMs ?? 7000;
  const listingPlaceId = keys.chij ?? keys.placeId;

  const fromCard = readCardCategories(keys.placeId);
  if (fromCard?.primary) return normalizeCategories(fromCard);

  if (options.cacheMaps) {
    const cached = lookupCategoriesFromCache(
      options.cacheMaps,
      keys.hexFid,
      listingPlaceId,
      keys.decimalCid
    );
    if (cached?.primary) return normalizeCategories(cached);
  }

  const fetched = await fetchCategoriesForListing(keys.hexFid, listingPlaceId, {
    decimalCid: keys.decimalCid,
    timeoutMs,
  });
  if (fetched?.primary) return normalizeCategories(fetched);

  return null;
}

/** Sync-only category lookup for Quick Scan (no per-listing JSPB fetch). */
export function resolveQuickScanCategories(
  keys: ListingCategoryKeys,
  options: {
    cacheMaps?: CategoryLookupMaps | null;
    fallbackCategory?: string;
  } = {}
): BusinessCategories {
  const listingPlaceId = keys.chij ?? keys.placeId;

  const fromCard = readCardCategories(keys.placeId);
  if (fromCard?.primary) return normalizeCategories(fromCard);

  if (options.cacheMaps) {
    const cached = lookupCategoriesFromCache(
      options.cacheMaps,
      keys.hexFid,
      listingPlaceId,
      keys.decimalCid
    );
    if (cached?.primary) return normalizeCategories(cached);
  }

  const fallback = options.fallbackCategory?.trim() ?? '';
  if (fallback) return { primary: fallback, secondary: [] };

  return { primary: '', secondary: [] };
}

/**
 * Resolve categories for a Deep Scan listing after the detail panel is open.
 * Priority: detail panel pill injection (with wait) → per-listing JSPB fetch
 * bypassing bulk cache (APP_INITIALIZATION_STATE is updated after panel load).
 */
export async function resolveDeepScanCategories(
  keys: ListingCategoryKeys,
  options: {
    waitForInjectionMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<BusinessCategories | null> {
  const waitMs = options.waitForInjectionMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 8000;
  const listingPlaceId = keys.chij ?? keys.placeId;

  // Poll for the detail panel injection — it takes a moment after panel load.
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    const fromPanel = readDetailPanelCategories();
    if (fromPanel?.primary) return normalizeCategories(fromPanel);
    await sleep(300);
  }

  // Panel injection not available — read directly from APP_INITIALIZATION_STATE
  // which Maps updates once the detail panel data is loaded. Bypass the bulk
  // cache so we get the freshly-loaded per-listing JSPB data.
  const fetched = await fetchCategoriesForListing(keys.hexFid, listingPlaceId, {
    decimalCid: keys.decimalCid,
    bypassBulkCache: true,
    timeoutMs,
  });
  if (fetched?.primary) return normalizeCategories(fetched);

  return null;
}

// Legacy alias used by merge-snapshot and category-resolver.
export async function resolveListingCategories(
  keys: ListingCategoryKeys,
  options: {
    cacheMaps?: CategoryLookupMaps | null;
    timeoutMs?: number;
    preferDetailPanel?: boolean;
    waitForInjectionMs?: number;
  } = {}
): Promise<BusinessCategories | null> {
  if (options.preferDetailPanel) {
    return resolveDeepScanCategories(keys, {
      waitForInjectionMs: options.waitForInjectionMs,
      timeoutMs: options.timeoutMs,
    });
  }
  return resolveCardCategories(keys, {
    cacheMaps: options.cacheMaps,
    timeoutMs: options.timeoutMs,
  });
}

export function pickBestCategories(
  sources: Array<BusinessCategories | null | undefined>
): BusinessCategories | null {
  for (const source of sources) {
    if (!source?.primary?.trim()) continue;
    return normalizeCategories(source);
  }
  return null;
}
