/**
 * Rank checking against Google Maps' internal search endpoint.
 *
 * `search?tbm=map&pb=...` returns the ranked local list as JSON, with the search origin
 * carried by `!2d<lng>!3d<lat>` in the `pb` blob. That is the actual "teleport" lever —
 * `uule` is ignored on the local finder, and `/search` pages require JavaScript, so this
 * endpoint is the only way to resolve a ranking without a paid SERP API.
 *
 * The payload is an undocumented positional structure. Indices were derived empirically
 * and are isolated in PLACE_* below so a Google-side change is a one-line fix rather than
 * a hunt through parsing code.
 */

import { decimalCidFromHexFid } from '../gbp-audit/place-id';

export interface RankCheckRequest {
  businessName: string;
  keyword: string;
  latitude: number;
  longitude: number;
  /** ChIJ id, hex feature id, `cid:<digits>`, or `/g/<mid>` — whatever the card exposed. */
  placeId?: string;
}

export interface RankCompetitor {
  rank: number;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  isTarget: boolean;
}

export interface RankCheckResult {
  rank: number | null;
  totalResults: number;
  competitors: RankCompetitor[];
  notFound: boolean;
  cached: boolean;
  error?: string;
}

/** Positional offsets inside each result's place record (`entry[PLACE]`). */
const PLACE = 14;
const PLACE_NAME = 11;
const PLACE_RATING_BLOCK = 4;
const PLACE_RATING = 7;
const PLACE_ADDRESS_LINES = 2;
const PLACE_HEX_FID = 10;
const PLACE_CHIJ = 78;
const PLACE_KG_MID = 89;
const PLACE_CATEGORIES = 13;
const PLACE_GEOMETRY = 9;
const GEOMETRY_LAT = 2;
const GEOMETRY_LNG = 3;

const RESULT_COUNT = 20;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 1200;
const JITTER_MS = 600;
const CACHE_PREFIX = 'rankCheck:';
const JSON_PREFIX = /^\)\]\}'\s*/;

interface PlaceRow {
  rank: number;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  keys: string[];
}

let queue: Promise<unknown> = Promise.resolve();
let lastRunAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPb(latitude: number, longitude: number): string {
  return [
    '!4m12!1m3',
    '!1d10000',
    `!2d${longitude}`,
    `!3d${latitude}`,
    '!2m3!1f0!2f0!3f0',
    '!3m2!1i1024!2i768',
    '!4f13.1',
    `!7i${RESULT_COUNT}`,
    '!8i0',
    '!10b1',
    '!12m3!1e3!2b1!3e2',
  ].join('');
}

function buildSearchUrl(keyword: string, latitude: number, longitude: number): string {
  // No `gl`: forcing a country skews the ordering away from the pin's own region, and
  // omitting it produces the same result as passing the region that matches the pin.
  const params = new URLSearchParams({
    tbm: 'map',
    authuser: '0',
    hl: 'en',
    q: keyword,
  });
  // `pb` must not be percent-encoded — Google rejects an escaped blob.
  return `https://www.google.com/search?${params.toString()}&pb=${buildPb(latitude, longitude)}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function identityKeys(place: unknown[]): string[] {
  const keys = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed) keys.add(trimmed);
  };

  const hexFid = asString(place[PLACE_HEX_FID]);
  if (hexFid) {
    add(hexFid);
    const cid = decimalCidFromHexFid(hexFid);
    if (cid) add(cid);
  }

  add(asString(place[PLACE_CHIJ]));
  add(asString(place[PLACE_KG_MID]));

  return [...keys];
}

function readAddress(place: unknown[]): string {
  const lines = place[PLACE_ADDRESS_LINES];
  if (!Array.isArray(lines)) return '';
  return lines.filter((line): line is string => typeof line === 'string').join(', ');
}

function parseResponse(body: string): PlaceRow[] {
  const json = JSON.parse(body.replace(JSON_PREFIX, '')) as unknown;
  const list = (json as never[][][])?.[0]?.[1];
  if (!Array.isArray(list)) return [];

  const rows: PlaceRow[] = [];

  for (const entry of list) {
    // The first element of the list is a query header, not a place.
    const place = Array.isArray(entry) ? (entry[PLACE] as unknown[] | undefined) : undefined;
    if (!Array.isArray(place)) continue;

    const name = asString(place[PLACE_NAME]);
    if (!name) continue;

    const ratingBlock = place[PLACE_RATING_BLOCK];
    const categories = place[PLACE_CATEGORIES];
    const geometry = place[PLACE_GEOMETRY];

    rows.push({
      rank: rows.length + 1,
      name,
      category: Array.isArray(categories) ? asString(categories[0]) : '',
      rating: Array.isArray(ratingBlock) ? asNumber(ratingBlock[PLACE_RATING]) : null,
      // Review counts are absent from this payload; richer `pb` variants break the response.
      reviewCount: null,
      address: readAddress(place),
      latitude: Array.isArray(geometry) ? asNumber(geometry[GEOMETRY_LAT]) : null,
      longitude: Array.isArray(geometry) ? asNumber(geometry[GEOMETRY_LNG]) : null,
      keys: identityKeys(place),
    });
  }

  return rows;
}

/** Every identifier that could denote the target, so matching can intersect key sets. */
function targetKeys(request: RankCheckRequest): Set<string> {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim().toLowerCase();
    if (trimmed) keys.add(trimmed);
  };

  const raw = request.placeId?.trim() ?? '';
  if (!raw) return keys;

  add(raw);
  add(raw.replace(/^cid:/i, ''));

  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(raw)) add(decimalCidFromHexFid(raw));
  for (const m of raw.matchAll(/ChIJ[A-Za-z0-9_-]{10,}/g)) add(m[0]);
  for (const m of raw.matchAll(/\/g\/[0-9a-z_]+/gi)) add(m[0]);

  return keys;
}

function locateTarget(rows: PlaceRow[], request: RankCheckRequest): number | null {
  const keys = targetKeys(request);

  if (keys.size > 0) {
    for (const row of rows) {
      if (row.keys.some((key) => keys.has(key))) return row.rank;
    }
  }

  // Name matching is a fallback only; it is ambiguous for chains and for competitors
  // whose name contains the target's.
  const wanted = normalizeName(request.businessName);
  if (!wanted) return null;

  for (const row of rows) {
    if (normalizeName(row.name) === wanted) return row.rank;
  }
  for (const row of rows) {
    const candidate = normalizeName(row.name);
    if (candidate.includes(wanted) || wanted.includes(candidate)) return row.rank;
  }

  return null;
}

/** Coordinates are rounded so nearby pins share a cache entry. ~100m at 3dp. */
function cacheKey(request: RankCheckRequest): string {
  return `${CACHE_PREFIX}${request.keyword.trim().toLowerCase()}|${request.latitude.toFixed(3)}|${request.longitude.toFixed(3)}`;
}

async function readCache(key: string): Promise<PlaceRow[] | null> {
  try {
    const store = await chrome.storage.session.get(key);
    const hit = store[key] as { at: number; rows: PlaceRow[] } | undefined;
    if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
    return hit.rows;
  } catch {
    return null;
  }
}

async function writeCache(key: string, rows: PlaceRow[]): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: { at: Date.now(), rows } });
  } catch {
    // Cache is best-effort.
  }
}

async function fetchRanking(request: RankCheckRequest): Promise<PlaceRow[]> {
  const response = await fetch(
    buildSearchUrl(request.keyword.trim(), request.latitude, request.longitude),
    {
      // Anonymous on purpose: the ranking should not be personalised to the signed-in user.
      credentials: 'omit',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.google.com/maps/',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google returned ${response.status} for this rank check.`);
  }

  const body = await response.text();
  if (!JSON_PREFIX.test(body)) {
    throw new Error('Google did not return ranking data. It may be rate limiting this device.');
  }

  return parseResponse(body);
}

function toResult(rows: PlaceRow[], request: RankCheckRequest, cached: boolean): RankCheckResult {
  const rank = locateTarget(rows, request);

  return {
    rank,
    totalResults: rows.length,
    competitors: rows.map((row) => ({
      rank: row.rank,
      name: row.name,
      category: row.category,
      rating: row.rating,
      reviewCount: row.reviewCount,
      address: row.address,
      isTarget: row.rank === rank,
    })),
    notFound: rank === null,
    cached,
  };
}

function failure(error: string): RankCheckResult {
  return { rank: null, totalResults: 0, competitors: [], notFound: true, cached: false, error };
}

export interface BusinessLocation {
  latitude: number;
  longitude: number;
  address: string;
  name: string;
}

/**
 * Resolve a business's own coordinates and address by name.
 *
 * Searching the name resolves the business worldwide regardless of the `pb` origin, so
 * the origin below is a neutral placeholder rather than a guess at where the business is.
 * This replaces geocoding the address in a hidden Maps tab: it needs no tab, and it
 * returns Google's own coordinates for the listing instead of an approximation.
 */
export function locateBusiness(query: {
  name: string;
  address?: string;
  placeId?: string;
}): Promise<BusinessLocation | null> {
  const run = queue.then(async () => {
    const name = query.name.trim();
    if (!name) return null;

    const address = query.address?.trim() ?? '';
    const usableAddress = address && !/^address not found$/i.test(address) ? address : '';
    const keyword = usableAddress ? `${name} ${usableAddress}` : name;

    const gap = Date.now() - lastRunAt;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap + Math.random() * JITTER_MS);
    lastRunAt = Date.now();

    let rows: PlaceRow[];
    try {
      rows = await fetchRanking({
        businessName: name,
        keyword,
        latitude: 0,
        longitude: 0,
        placeId: query.placeId,
      });
    } catch {
      return null;
    }

    const keys = targetKeys({
      businessName: name,
      keyword,
      latitude: 0,
      longitude: 0,
      placeId: query.placeId,
    });
    const wanted = normalizeName(name);

    const match =
      (keys.size > 0 ? rows.find((row) => row.keys.some((key) => keys.has(key))) : undefined) ??
      rows.find((row) => normalizeName(row.name) === wanted) ??
      null;

    if (match?.latitude == null || match?.longitude == null) return null;

    return {
      latitude: match.latitude,
      longitude: match.longitude,
      address: match.address || usableAddress,
      name: match.name,
    };
  });

  queue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

/**
 * Serialized and throttled: bursts of requests from one IP are what triggers Google's
 * rate limiting, and the feature depends on not tripping it.
 */
export function checkRank(request: RankCheckRequest): Promise<RankCheckResult> {
  const run = queue.then(async () => {
    if (!request.keyword.trim()) return failure('Enter a search keyword first.');

    const key = cacheKey(request);
    const cachedRows = await readCache(key);
    if (cachedRows) return toResult(cachedRows, request, true);

    const gap = Date.now() - lastRunAt;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap + Math.random() * JITTER_MS);
    lastRunAt = Date.now();

    try {
      const rows = await fetchRanking(request);
      if (rows.length === 0) {
        return failure('Google returned no local results for this keyword and location.');
      }
      await writeCache(key, rows);
      return toResult(rows, request, false);
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Rank check failed.');
    }
  });

  queue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}
