import { cleanBusinessName } from '../utils/business-name';

const NWF_SOURCE = 'nwf-maps-main';
const BRIDGE_SOURCE = 'nwf-maps-bridge';
const CID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;

export interface BusinessCategories {
  primary: string;
  secondary: string[];
}

interface CategoryRecord extends BusinessCategories {
  hexFid: string;
  placeId: string | null;
  cid?: string | null;
}

export interface CategoryLookupMaps {
  byHexFid: Map<string, BusinessCategories>;
  byPlaceId: Map<string, BusinessCategories>;
  byCid: Map<string, BusinessCategories>;
}

function postMessageRequest<T>(
  type: string,
  responseType: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  pickResult: (data: Record<string, unknown>) => T | null
): Promise<T | null> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown>;
      if (data?.source !== NWF_SOURCE || data.type !== responseType || data.requestId !== requestId) {
        return;
      }
      finish(pickResult(data));
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type,
        requestId,
        ...payload,
      },
      '*'
    );
  });
}

function recordsToMaps(records: CategoryRecord[]): CategoryLookupMaps {
  const byHexFid = new Map<string, BusinessCategories>();
  const byPlaceId = new Map<string, BusinessCategories>();
  const byCid = new Map<string, BusinessCategories>();

  for (const record of records) {
    const categories = { primary: record.primary, secondary: record.secondary };
    byHexFid.set(record.hexFid.toLowerCase(), categories);
    if (record.placeId?.startsWith('ChIJ')) {
      byPlaceId.set(record.placeId, categories);
    }
    if (record.cid) {
      byCid.set(record.cid, categories);
    }
  }

  return { byHexFid, byPlaceId, byCid };
}

function mapsHasData(maps: CategoryLookupMaps): boolean {
  return maps.byHexFid.size > 0 || maps.byPlaceId.size > 0 || maps.byCid.size > 0;
}

function emptyMaps(): CategoryLookupMaps {
  return { byHexFid: new Map(), byPlaceId: new Map(), byCid: new Map() };
}

let cachedMaps: CategoryLookupMaps | null = null;
let cacheUpdatedAt = 0;
let bulkFetchPromise: Promise<CategoryLookupMaps> | null = null;

async function requestCategoriesBulk(timeoutMs: number): Promise<CategoryLookupMaps> {
  const started = Date.now();
  let records: CategoryRecord[] | null = null;

  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;

    records = await postMessageRequest<CategoryRecord[]>(
      'NWF_GET_CATEGORIES_BULK',
      'NWF_CATEGORIES_BULK',
      {},
      Math.min(4500, remaining),
      (data) => (Array.isArray(data.records) ? (data.records as CategoryRecord[]) : null)
    );

    if (records && records.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return recordsToMaps(records ?? []);
}

export async function fetchAllCategoriesFromMainWorld(
  options: { force?: boolean; timeoutMs?: number; maxAgeMs?: number } = {}
): Promise<CategoryLookupMaps> {
  const maxAgeMs = options.maxAgeMs ?? 2500;
  const timeoutMs = options.timeoutMs ?? 6000;

  if (!options.force && cachedMaps && mapsHasData(cachedMaps) && Date.now() - cacheUpdatedAt < maxAgeMs) {
    return cachedMaps;
  }

  if (bulkFetchPromise) return bulkFetchPromise;

  bulkFetchPromise = requestCategoriesBulk(timeoutMs)
    .then((maps) => {
      if (mapsHasData(maps)) {
        cachedMaps = maps;
        cacheUpdatedAt = Date.now();
      }
      return maps;
    })
    .finally(() => {
      bulkFetchPromise = null;
    });

  return bulkFetchPromise;
}

function buildPreviewPlaceUrlForIds(
  hexFid: string | null,
  placeId: string | null,
  decimalCid: string | null
): string | null {
  if (hexFid && CID_RE.test(hexFid)) {
    const fidEnc = encodeURIComponent(hexFid);
    const pidSafe = String(placeId ?? '');
    const pb =
      `!1m21!1s${fidEnc}` +
      `!3m9!1m3!1d11022!2d0!3d0!2m0!3m2!1i624!2i744!4f13.1` +
      `!4m2!3d0!4d0` +
      `!15m6!1m5!1s${fidEnc}!4s${fidEnc}!5s${pidSafe}!6s0!7s0` +
      `!6splace`;
    return `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&pb=${pb}&q=place`;
  }
  if (decimalCid) {
    try {
      const hexPart = BigInt(decimalCid).toString(16);
      const syntheticFid = `0x0:0x${hexPart}`;
      return buildPreviewPlaceUrlForIds(syntheticFid, placeId, null);
    } catch {
      return null;
    }
  }
  if (placeId?.startsWith('ChIJ')) {
    return `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=place_id:${encodeURIComponent(placeId)}`;
  }
  return null;
}

async function fetchCategoriesViaPreview(
  hexFid: string | null,
  placeId: string | null,
  decimalCid: string | null,
  timeoutMs: number
): Promise<CategoryRecord | null> {
  const url = buildPreviewPlaceUrlForIds(hexFid, placeId, decimalCid);
  if (!url) return null;

  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const text = await res.text();
    return postMessageRequest<CategoryRecord>(
      'NWF_PARSE_CATEGORY_TEXT',
      'NWF_PARSED_CATEGORIES',
      { text, hexFid, placeId, decimalCid },
      timeoutMs,
      (data) => (data.categories ? (data.categories as CategoryRecord) : null)
    );
  } catch {
    return null;
  }
}

export async function fetchCategoriesForListing(
  hexFid: string | null | undefined,
  placeId: string | null | undefined,
  options: {
    timeoutMs?: number;
    decimalCid?: string | null;
    /** Skip bulk cache so NWF_GET_CATEGORIES always runs for this listing. */
    bypassBulkCache?: boolean;
  } = {}
): Promise<BusinessCategories | null> {
  if (!options.bypassBulkCache) {
    const maps = await fetchAllCategoriesFromMainWorld({
      timeoutMs: options.timeoutMs ?? 6000,
      force: !mapsHasData(cachedMaps ?? emptyMaps()),
    });

    const lookup = lookupCategoriesFromCache(
      maps,
      hexFid ?? null,
      placeId ?? null,
      options.decimalCid ?? null
    );
    if (lookup) return lookup;
  }

  const normalizedHex =
    hexFid?.toLowerCase() ?? (placeId && CID_RE.test(placeId) ? placeId.toLowerCase() : null);
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;

  if (!normalizedHex && !normalizedPlace && !options.decimalCid) {
    return null;
  }

  const single = await postMessageRequest<CategoryRecord>(
    'NWF_GET_CATEGORIES',
    'NWF_CATEGORIES',
    {
      hexFid: normalizedHex,
      placeId: normalizedPlace,
      decimalCid: options.decimalCid ?? null,
    },
    options.timeoutMs ?? 6000,
    (data) => (data.categories ? (data.categories as CategoryRecord) : null)
  );

  let record = single;
  if (!record?.primary && options.bypassBulkCache) {
    record = await fetchCategoriesViaPreview(
      normalizedHex,
      normalizedPlace,
      options.decimalCid ?? null,
      options.timeoutMs ?? 10000
    );
  }

  if (!record?.primary) return null;

  const categories = { primary: record.primary, secondary: record.secondary ?? [] };
  cachedMaps ??= emptyMaps();
  cachedMaps.byHexFid.set(record.hexFid.toLowerCase(), categories);
  if (record.placeId?.startsWith('ChIJ')) {
    cachedMaps.byPlaceId.set(record.placeId, categories);
  }
  if (record.cid) {
    cachedMaps.byCid.set(record.cid, categories);
  }
  cacheUpdatedAt = Date.now();
  return categories;
}

const NON_CATEGORY_LABELS =
  /^(sponsored|ad|ads|advertisement|promoted|featured|website|directions|call|save|share|reviews?)$/i;

/** Reject scraped text that is clearly not a GBP category (e.g. business name, "Sponsored"). */
export function isPlausibleGmbCategory(
  categories: BusinessCategories,
  businessName: string
): boolean {
  const primary = categories.primary.trim();
  if (!primary || primary.length > 80) return false;
  if (NON_CATEGORY_LABELS.test(primary)) return false;

  const normalizedName = cleanBusinessName(businessName).toLowerCase();
  const normalizedPrimary = primary.toLowerCase();
  if (!normalizedName) return true;

  if (normalizedPrimary === normalizedName) return false;
  if (normalizedName.includes(normalizedPrimary) && normalizedPrimary.length >= 8) return false;
  if (normalizedPrimary.includes(normalizedName) && normalizedName.length >= 8) return false;

  return true;
}

export function sanitizeGmbCategories(
  categories: BusinessCategories,
  businessName: string
): BusinessCategories {
  const primary = categories.primary.trim();
  const nameLower = cleanBusinessName(businessName).toLowerCase();
  const secondary = (categories.secondary ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const lower = s.toLowerCase();
      if (lower === nameLower || lower === primary.toLowerCase()) return false;
      if (NON_CATEGORY_LABELS.test(s)) return false;
      return isPlausibleGmbCategory({ primary: s, secondary: [] }, businessName);
    });
  return { primary, secondary };
}

export function lookupCategoriesFromCache(
  maps: CategoryLookupMaps,
  hexFid: string | null,
  placeId: string | null,
  decimalCid: string | null = null
): BusinessCategories | null {
  const normalizedHex = hexFid?.toLowerCase() ?? null;
  if (normalizedHex && maps.byHexFid.has(normalizedHex)) {
    return maps.byHexFid.get(normalizedHex) ?? null;
  }

  if (placeId && CID_RE.test(placeId)) {
    const asHex = placeId.toLowerCase();
    if (maps.byHexFid.has(asHex)) {
      return maps.byHexFid.get(asHex) ?? null;
    }
  }

  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;
  if (normalizedPlace && maps.byPlaceId.has(normalizedPlace)) {
    return maps.byPlaceId.get(normalizedPlace) ?? null;
  }

  if (decimalCid && maps.byCid.has(decimalCid)) {
    return maps.byCid.get(decimalCid) ?? null;
  }

  if (placeId?.startsWith('cid:')) {
    const cid = placeId.slice(4);
    if (maps.byCid.has(cid)) {
      return maps.byCid.get(cid) ?? null;
    }
  }

  return null;
}

export async function fetchNegativeReviewCountForListing(
  hexFid: string | null | undefined,
  placeId: string | null | undefined,
  options: { timeoutMs?: number; decimalCid?: string | null } = {}
): Promise<number | null> {
  const normalizedHex = hexFid?.toLowerCase() ?? (placeId && CID_RE.test(placeId) ? placeId.toLowerCase() : null);
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;

  return postMessageRequest<number>(
    'NWF_GET_NEGATIVE_REVIEW_COUNT',
    'NWF_NEGATIVE_REVIEW_COUNT',
    {
      hexFid: normalizedHex,
      placeId: normalizedPlace,
      decimalCid: options.decimalCid ?? null,
    },
    options.timeoutMs ?? 6000,
    (data) => {
      const count = data.negativeReviewCount;
      return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
    }
  );
}
