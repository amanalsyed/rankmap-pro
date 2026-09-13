/**
 * Runs in the page (MAIN) world — reads live APP_INITIALIZATION_STATE and
 * falls back to /maps/preview/place (same technique as Ghost Map Pro).
 */

const NWF_SOURCE = 'nwf-maps-main';
const BRIDGE_SOURCE = 'nwf-maps-bridge';
const CID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;

interface ExtractedIdentifiers {
  placeId: string | null;
  cid: string | null;
  knowledgeGraphId: string | null;
  businessProfileId: string | null;
  hexFid: string | null;
  lat: number | null;
  lng: number | null;
}

export interface BusinessCategories {
  primary: string;
  secondary: string[];
}

interface CategoryRecord extends BusinessCategories {
  hexFid: string;
  placeId: string | null;
  cid: string | null;
}

function extractCategoriesFromInner(inner: unknown[]): BusinessCategories | null {
  const names: string[] = [];
  const addName = (value: string) => {
    const clean = value.trim();
    if (!clean || clean.length > 80) return;
    if (!names.includes(clean)) names.push(clean);
  };

  const raw = inner[13];
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === 'string') addName(value);
    }
  }

  if (names.length === 0 && Array.isArray(inner[76])) {
    for (const entry of inner[76]) {
      if (!Array.isArray(entry)) continue;
      const label = entry[1];
      if (typeof label === 'string') addName(label);
    }
  }

  if (names.length === 0) return null;

  return {
    primary: names[0],
    secondary: names.slice(1),
  };
}

function parseJspbPayload(raw: string): unknown | null {
  const newline = raw.indexOf('\n');
  const trimmed = newline >= 0 ? raw.slice(newline + 1) : raw.slice(4);
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function findLargestJspbPayload(state: unknown): string | null {
  const payloads = findJspbPayloads(state);
  return payloads[0] ?? null;
}

function walkJspbForCategoryRecords(node: unknown, records: Map<string, CategoryRecord>): void {
  if (!Array.isArray(node)) return;

  const inner = Array.isArray(node[1]) ? (node[1] as unknown[]) : null;
  if (inner && inner.length > 10) {
    const hexFidRaw = inner[10];
    if (typeof hexFidRaw === 'string' && CID_RE.test(hexFidRaw)) {
      const hexFid = hexFidRaw.toLowerCase();
      const categories = extractCategoriesFromInner(inner);
      if (categories && !records.has(hexFid)) {
        const allIds = get(inner, [227, 0]);
        const placeId =
          (typeof inner[78] === 'string' && inner[78].startsWith('ChIJ') ? inner[78] : null) ??
          (Array.isArray(allIds) && typeof allIds[4] === 'string' && allIds[4].startsWith('ChIJ')
            ? allIds[4]
            : null);

        records.set(hexFid, {
          hexFid,
          placeId,
          cid: hexCidFromFid(hexFid),
          primary: categories.primary,
          secondary: categories.secondary,
        });
      }
    }
  }

  if (node.length > 10) {
    const hexFidRaw = node[10];
    if (typeof hexFidRaw === 'string' && CID_RE.test(hexFidRaw)) {
      const hexFid = hexFidRaw.toLowerCase();
      const categories = extractCategoriesFromInner(node as unknown[]);
      if (categories && !records.has(hexFid)) {
        const allIds = get(node, [227, 0]);
        const placeId =
          (typeof node[78] === 'string' && (node[78] as string).startsWith('ChIJ') ? node[78] : null) ??
          (Array.isArray(allIds) && typeof allIds[4] === 'string' && allIds[4].startsWith('ChIJ')
            ? allIds[4]
            : null);

        records.set(hexFid, {
          hexFid,
          placeId: typeof placeId === 'string' ? placeId : null,
          cid: hexCidFromFid(hexFid),
          primary: categories.primary,
          secondary: categories.secondary,
        });
      }
    }
  }

  for (const entry of node) walkJspbForCategoryRecords(entry, records);
}

function get(root: unknown, path: number[]): unknown {
  let value: unknown = root;
  for (const key of path) {
    if (value == null || typeof value !== 'object') return null;
    value = (value as unknown[])[key];
  }
  return value ?? null;
}

function innerMatchesListing(
  inner: unknown[],
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): boolean {
  const hexRaw = inner[10];
  if (typeof hexRaw !== 'string' || !CID_RE.test(hexRaw)) return false;

  const hex = hexRaw.toLowerCase();
  const normalizedHex = hexFid?.toLowerCase() ?? null;
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;
  const hexFromPlace = placeId && CID_RE.test(placeId) ? placeId.toLowerCase() : null;

  if (normalizedHex && hex === normalizedHex) return true;
  if (hexFromPlace && hex === hexFromPlace) return true;

  const innerPlaceId =
    typeof inner[78] === 'string' && inner[78].startsWith('ChIJ') ? inner[78] : null;
  if (normalizedPlace && innerPlaceId === normalizedPlace) return true;

  if (decimalCid) {
    const innerCid = hexCidFromFid(hex);
    if (innerCid === decimalCid) return true;
  }

  return !normalizedHex && !normalizedPlace && !hexFromPlace && !decimalCid;
}

function parseStarDistribution(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 5) return null;
  const counts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const value = raw[i];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    counts.push(Math.round(value));
  }
  return counts;
}

function negativeCountFromDistribution(dist: number[]): number {
  return (dist[0] ?? 0) + (dist[1] ?? 0);
}

function extractStarDistributionFromInner(inner: unknown[]): number[] | null {
  const paths: number[][] = [[175, 3], [175, 2], [4, 8]];
  for (const path of paths) {
    const dist = parseStarDistribution(get(inner, path));
    if (dist) return dist;
  }
  return null;
}

function readNegativeReviewCountFromState(
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): number | null {
  const w = window as unknown as { APP_INITIALIZATION_STATE?: unknown };
  const state = w.APP_INITIALIZATION_STATE;
  if (!state) return null;

  const inners = collectBusinessInners(state);
  const matching = inners.filter((inner) => innerMatchesListing(inner, hexFid, placeId, decimalCid));
  const candidates = matching.length > 0 ? matching : inners.length === 1 ? inners : [];

  for (const inner of candidates) {
    const dist = extractStarDistributionFromInner(inner);
    if (dist) return negativeCountFromDistribution(dist);
  }

  const raw = findLargestJspbPayload(state);
  if (raw) {
    const parsed = parseJspbPayload(raw);
    if (parsed) {
      const records: unknown[][] = [];
      const seen = new Set<unknown>();
      const walk = (node: unknown): void => {
        if (!Array.isArray(node)) return;
        if (Array.isArray(node[1]) && node[1].length > 10) {
          const inner = node[1] as unknown[];
          const hex = inner[10];
          if (typeof hex === 'string' && CID_RE.test(hex) && !seen.has(inner)) {
            seen.add(inner);
            records.push(inner);
          }
        }
        for (const entry of node) walk(entry);
      };
      walk(parsed);

      const payloadMatches = records.filter((inner) =>
        innerMatchesListing(inner, hexFid, placeId, decimalCid)
      );
      const payloadCandidates = payloadMatches.length > 0 ? payloadMatches : records;

      for (const inner of payloadCandidates) {
        const dist = extractStarDistributionFromInner(inner);
        if (dist) return negativeCountFromDistribution(dist);
      }
    }
  }

  return null;
}

function hexCidFromFid(fid: string): string | null {
  const parts = fid.split(':');
  if (parts.length !== 2) return null;
  try {
    return BigInt(parts[1]).toString(10);
  } catch {
    return null;
  }
}

function scoreProfileCandidate(value: string, decimalCid: string | null): number {
  if (value === decimalCid) return -1;
  if (!/^\d{16,20}$/.test(value)) return -1;
  let score = value.length >= 18 ? 3 : 1;
  if (value.length === 19) score += 2;
  return score;
}

function pickBestProfileCandidate(candidates: Iterable<string>, decimalCid: string | null): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const value of candidates) {
    const score = scoreProfileCandidate(value, decimalCid);
    if (score > bestScore) {
      best = value;
      bestScore = score;
    }
  }
  return best;
}

function collectProfileCandidatesFromText(
  text: string,
  decimalCid: string | null,
  out: Set<string>
): void {
  for (const match of text.matchAll(/"(\d{16,20})"/g)) {
    if (match[1] !== decimalCid) out.add(match[1]);
  }
  for (const match of text.matchAll(/locations\/(\d{16,20})/gi)) {
    if (match[1] !== decimalCid) out.add(match[1]);
  }
}

function profileIdNearAnchor(raw: string, anchor: string, decimalCid: string | null): string | null {
  const idx = raw.toLowerCase().indexOf(anchor.toLowerCase());
  if (idx < 0) return null;
  const slice = raw.slice(Math.max(0, idx - 800), idx + 3200);
  const candidates = new Set<string>();
  collectProfileCandidatesFromText(slice, decimalCid, candidates);
  return pickBestProfileCandidate(candidates, decimalCid);
}

function walkForProfileCandidates(
  value: unknown,
  decimalCid: string | null,
  out: Set<string>,
  depth = 0
): void {
  if (depth > 30 || value == null) return;

  if (typeof value === 'string') {
    if (/^\d{16,20}$/.test(value) && value !== decimalCid) out.add(value);
    const loc = value.match(/locations\/(\d{16,20})/i);
    if (loc?.[1] && loc[1] !== decimalCid) out.add(loc[1]);
    if (value.length > 1000 && value.startsWith(")]}'")) {
      collectProfileCandidatesFromText(value, decimalCid, out);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) walkForProfileCandidates(entry, decimalCid, out, depth + 1);
  }
}

function extractBusinessProfileId(
  inner: unknown[],
  decimalCid: string | null,
  rawPayloads: string[]
): string | null {
  const candidates = new Set<string>();

  const allIds = get(inner, [227, 0]);
  if (Array.isArray(allIds)) {
    for (const entry of allIds) {
      if (typeof entry === 'string' && /^\d{16,20}$/.test(entry) && entry !== decimalCid) {
        candidates.add(entry);
      }
    }
  }

  walkForProfileCandidates(inner, decimalCid, candidates);

  for (const raw of rawPayloads) {
    const hexFid = typeof inner[10] === 'string' ? inner[10] : null;
    if (hexFid) {
      const near = profileIdNearAnchor(raw, hexFid, decimalCid);
      if (near) candidates.add(near);
    }
    const placeId = typeof inner[78] === 'string' ? inner[78] : null;
    if (placeId) {
      const near = profileIdNearAnchor(raw, placeId, decimalCid);
      if (near) candidates.add(near);
    }
  }

  return pickBestProfileCandidate(candidates, decimalCid);
}

function extractFromBusinessInner(inner: unknown[], rawPayloads: string[]): ExtractedIdentifiers | null {
  const hexFidRaw = inner[10];
  if (typeof hexFidRaw !== 'string' || !CID_RE.test(hexFidRaw)) return null;

  const hexFid = hexFidRaw.toLowerCase();
  const decimalCid = hexCidFromFid(hexFid);
  const allIds = get(inner, [227, 0]);

  const placeId =
    (typeof inner[78] === 'string' && inner[78].startsWith('ChIJ') ? inner[78] : null) ??
    (Array.isArray(allIds) && typeof allIds[4] === 'string' && allIds[4].startsWith('ChIJ')
      ? allIds[4]
      : null);

  const knowledgeGraphId =
    (typeof inner[89] === 'string' && inner[89].startsWith('/g/') ? inner[89] : null) ??
    (Array.isArray(allIds) && typeof allIds[3] === 'string' && allIds[3].startsWith('/g/')
      ? allIds[3]
      : null);

  const lat = typeof get(inner, [9, 2]) === 'number' ? (get(inner, [9, 2]) as number) : null;
  const lng = typeof get(inner, [9, 3]) === 'number' ? (get(inner, [9, 3]) as number) : null;

  return {
    hexFid,
    cid: decimalCid,
    placeId,
    knowledgeGraphId,
    businessProfileId: extractBusinessProfileId(inner, decimalCid, rawPayloads),
    lat,
    lng,
  };
}

function findJspbPayloads(state: unknown): string[] {
  const payloads: string[] = [];
  let visited = 0;
  const seen = new WeakSet<object>();

  const search = (node: unknown, depth: number): void => {
    if (visited > 200_000 || depth > 20) return;
    visited++;

    if (typeof node === 'string') {
      if (node.length > 1000 && node.startsWith(")]}'")) payloads.push(node);
      return;
    }

    if (Array.isArray(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      for (const entry of node) search(entry, depth + 1);
      return;
    }

    if (node && typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
      for (const key of Object.keys(node)) search((node as Record<string, unknown>)[key], depth + 1);
    }
  };

  try {
    search(state, 0);
  } catch {
    /* ignore */
  }

  return payloads.sort((a, b) => b.length - a.length);
}

function collectBusinessInners(state: unknown): unknown[][] {
  const inners: unknown[][] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (Array.isArray(node[1]) && node[1].length > 10) {
      const inner = node[1] as unknown[];
      const hex = inner[10];
      if (typeof hex === 'string' && CID_RE.test(hex) && !seen.has(inner)) {
        seen.add(inner);
        inners.push(inner);
      }
    }
    if (Array.isArray(node) && node.length > 10) {
      const hex = node[10];
      if (typeof hex === 'string' && CID_RE.test(hex) && !seen.has(node)) {
        seen.add(node);
        inners.push(node);
      }
    }
    for (const entry of node) walk(entry);
  };

  walk(state);
  return inners;
}

function collectCategoryRecords(state: unknown): CategoryRecord[] {
  const byHex = new Map<string, CategoryRecord>();

  for (const inner of collectBusinessInners(state)) {
    const hexFidRaw = inner[10];
    if (typeof hexFidRaw !== 'string' || !CID_RE.test(hexFidRaw)) continue;

    const hexFid = hexFidRaw.toLowerCase();
    const categories = extractCategoriesFromInner(inner);
    if (!categories || byHex.has(hexFid)) continue;

    const allIds = get(inner, [227, 0]);
    const placeId =
      (typeof inner[78] === 'string' && inner[78].startsWith('ChIJ') ? inner[78] : null) ??
      (Array.isArray(allIds) && typeof allIds[4] === 'string' && allIds[4].startsWith('ChIJ')
        ? allIds[4]
        : null);

    byHex.set(hexFid, {
      hexFid,
      placeId,
      cid: hexCidFromFid(hexFid),
      primary: categories.primary,
      secondary: categories.secondary,
    });
  }

  const raw = findLargestJspbPayload(state);
  if (raw) {
    const parsed = parseJspbPayload(raw);
    if (parsed) walkJspbForCategoryRecords(parsed, byHex);
  }

  return [...byHex.values()];
}

function pickMatchingCategory(
  records: CategoryRecord[],
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): CategoryRecord | null {
  const normalizedHex = hexFid?.toLowerCase() ?? null;
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;
  const hexFromPlace =
    placeId && CID_RE.test(placeId) ? placeId.toLowerCase() : null;

  if (normalizedHex) {
    const match = records.find((record) => record.hexFid === normalizedHex);
    if (match) return match;
  }

  if (hexFromPlace) {
    const match = records.find((record) => record.hexFid === hexFromPlace);
    if (match) return match;
  }

  if (normalizedPlace) {
    const match = records.find((record) => record.placeId === normalizedPlace);
    if (match) return match;
  }

  if (decimalCid) {
    const match = records.find((record) => record.cid === decimalCid);
    if (match) return match;
  }

  return null;
}

function collectBusinessRecords(state: unknown): ExtractedIdentifiers[] {
  const rawPayloads = findJspbPayloads(state);
  const inners = collectBusinessInners(state);
  const records: ExtractedIdentifiers[] = [];
  const seen = new Set<string>();

  for (const inner of inners) {
    const record = extractFromBusinessInner(inner, rawPayloads);
    if (record?.hexFid && !seen.has(record.hexFid)) {
      seen.add(record.hexFid);
      records.push(record);
    }
  }

  if (records.length === 0 && rawPayloads.length > 0) {
    for (const raw of rawPayloads) {
      for (const match of raw.matchAll(/(0x[0-9a-f]+:0x[0-9a-f]+)/gi)) {
        const hexFid = match[1].toLowerCase();
        if (seen.has(hexFid)) continue;
        seen.add(hexFid);
        const decimalCid = hexCidFromFid(hexFid);
        const businessProfileId = profileIdNearAnchor(raw, hexFid, decimalCid);
        records.push({
          hexFid,
          cid: decimalCid,
          placeId: null,
          knowledgeGraphId: null,
          businessProfileId,
          lat: null,
          lng: null,
        });
      }
    }
  }

  return records;
}

function pickMatchingRecord(
  records: ExtractedIdentifiers[],
  hexFid?: string | null,
  placeId?: string | null
): ExtractedIdentifiers | null {
  const normalizedHex = hexFid?.toLowerCase() ?? null;
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;

  if (normalizedHex) {
    const match = records.find((record) => record.hexFid === normalizedHex);
    if (match) return match;
  }

  if (normalizedPlace) {
    const match = records.find((record) => record.placeId === normalizedPlace);
    if (match) return match;
  }

  if (records.length === 1) return records[0] ?? null;

  return records.find((record) => record.businessProfileId) ?? records[0] ?? null;
}

function buildPreviewPlaceUrl(input: {
  hexFid: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string;
}): string {
  const lat = input.lat ?? 0;
  const lng = input.lng ?? 0;
  const fidEnc = encodeURIComponent(input.hexFid);
  const pidSafe = String(input.placeId ?? '');
  const querySafe = String(input.query ?? 'place').replace(/[^a-zA-Z0-9_-]/g, '') || 'place';
  const pb =
    `!1m21!1s${fidEnc}` +
    `!3m9!1m3!1d11022!2d${lng}!3d${lat}!2m0!3m2!1i624!2i744!4f13.1` +
    `!4m2!3d${lat}!4d${lng}` +
    `!15m6!1m5!1s${fidEnc}!4s${fidEnc}!5s${pidSafe}!6s0!7s0` +
    `!6s${querySafe}`;
  return `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&pb=${pb}&q=${encodeURIComponent(querySafe)}`;
}

async function fetchProfileIdFromPreview(record: ExtractedIdentifiers): Promise<string | null> {
  if (!record.hexFid) return null;
  try {
    const url = buildPreviewPlaceUrl({
      hexFid: record.hexFid,
      placeId: record.placeId,
      lat: record.lat,
      lng: record.lng,
    });
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const text = await res.text();
    const nearFid = profileIdNearAnchor(text, record.hexFid, record.cid);
    if (nearFid) return nearFid;
    if (record.placeId) {
      const nearPlace = profileIdNearAnchor(text, record.placeId, record.cid);
      if (nearPlace) return nearPlace;
    }
    const candidates = new Set<string>();
    collectProfileCandidatesFromText(text, record.cid, candidates);
    return pickBestProfileCandidate(candidates, record.cid);
  } catch {
    return null;
  }
}

async function readIdentifiers(
  hexFid?: string | null,
  placeId?: string | null
): Promise<ExtractedIdentifiers | null> {
  const w = window as unknown as { APP_INITIALIZATION_STATE?: unknown };
  const state = w.APP_INITIALIZATION_STATE;
  if (!state) return null;

  const records = collectBusinessRecords(state);
  let record = pickMatchingRecord(records, hexFid, placeId);
  if (!record && records.length > 0) record = records[0] ?? null;
  if (!record) return null;

  if (!record.businessProfileId) {
    const fromPreview = await fetchProfileIdFromPreview(record);
    if (fromPreview) record = { ...record, businessProfileId: fromPreview };
  }

  return record;
}

function readCategories(
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): CategoryRecord | null {
  const w = window as unknown as { APP_INITIALIZATION_STATE?: unknown };
  const state = w.APP_INITIALIZATION_STATE;
  if (state) {
    const records = collectCategoryRecords(state);
    const match = pickMatchingCategory(records, hexFid, placeId, decimalCid);
    if (match?.primary) return match;
  }

  return null;
}

function extractJspbPayloadsFromText(text: string): string[] {
  const payloads: string[] = [];
  let idx = 0;
  while (idx < text.length) {
    const start = text.indexOf(")]}'", idx);
    if (start < 0) break;
    const next = text.indexOf(")]}'", start + 4);
    const end = next > start ? next : Math.min(text.length, start + 800_000);
    payloads.push(text.slice(start, end));
    idx = start + 4;
  }
  return payloads.sort((a, b) => b.length - a.length);
}

function collectCategoryRecordsFromText(text: string): CategoryRecord[] {
  const byHex = new Map<string, CategoryRecord>();
  for (const raw of extractJspbPayloadsFromText(text)) {
    const parsed = parseJspbPayload(raw);
    if (!parsed) continue;
    walkJspbForCategoryRecords(parsed, byHex);
    for (const record of collectCategoryRecords(parsed)) {
      if (!byHex.has(record.hexFid)) byHex.set(record.hexFid, record);
    }
  }
  return [...byHex.values()];
}

function buildPreviewUrlForListing(
  hexFid: string | null,
  placeId: string | null,
  decimalCid: string | null
): string | null {
  if (hexFid && CID_RE.test(hexFid)) {
    return buildPreviewPlaceUrl({ hexFid, placeId });
  }
  if (decimalCid) {
    try {
      const hexPart = BigInt(decimalCid).toString(16);
      const syntheticFid = `0x0:0x${hexPart}`;
      if (CID_RE.test(syntheticFid)) {
        return buildPreviewPlaceUrl({ hexFid: syntheticFid, placeId });
      }
    } catch {
      // fall through
    }
  }
  if (placeId?.startsWith('ChIJ')) {
    return `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=place_id:${encodeURIComponent(placeId)}`;
  }
  return null;
}

async function fetchCategoriesFromPreview(
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): Promise<CategoryRecord | null> {
  const url = buildPreviewUrlForListing(hexFid ?? null, placeId ?? null, decimalCid ?? null);
  if (!url) return null;

  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const text = await res.text();
    const records = collectCategoryRecordsFromText(text);
    const match = pickMatchingCategory(records, hexFid, placeId, decimalCid);
    if (match?.primary) return match;
    // Single-listing preview responses are place-specific; never pick an arbitrary row.
    if (records.length === 1 && records[0]?.primary && (hexFid || placeId || decimalCid)) {
      return records[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function readCategoriesAsync(
  hexFid?: string | null,
  placeId?: string | null,
  decimalCid?: string | null
): Promise<CategoryRecord | null> {
  const cached = readCategories(hexFid, placeId, decimalCid);
  if (cached?.primary) return cached;
  return fetchCategoriesFromPreview(hexFid, placeId, decimalCid);
}

function readAllCategories(): CategoryRecord[] {
  const w = window as unknown as { APP_INITIALIZATION_STATE?: unknown };
  const state = w.APP_INITIALIZATION_STATE;
  if (!state) return [];
  return collectCategoryRecords(state);
}

function readAllIdentifiers(): ExtractedIdentifiers[] {
  const w = window as unknown as { APP_INITIALIZATION_STATE?: unknown };
  const state = w.APP_INITIALIZATION_STATE;
  if (!state) return [];
  return collectBusinessRecords(state);
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as {
    source?: string;
    type?: string;
    requestId?: string;
    hexFid?: string | null;
    placeId?: string | null;
  };
  if (!data || data.source !== BRIDGE_SOURCE) return;

  if (data.type === 'NWF_GET_IDENTIFIERS') {
    void readIdentifiers(data.hexFid, data.placeId).then((identifiers) => {
      window.postMessage(
        {
          source: NWF_SOURCE,
          type: 'NWF_IDENTIFIERS',
          requestId: data.requestId,
          identifiers,
        },
        '*'
      );
    });
    return;
  }

  if (data.type === 'NWF_GET_CATEGORIES') {
    const payload = data as { decimalCid?: string | null };
    void readCategoriesAsync(data.hexFid, data.placeId, payload.decimalCid ?? null).then((categories) => {
      window.postMessage(
        {
          source: NWF_SOURCE,
          type: 'NWF_CATEGORIES',
          requestId: data.requestId,
          categories,
        },
        '*'
      );
    });
    return;
  }

  if (data.type === 'NWF_PARSE_CATEGORY_TEXT') {
    const payload = data as {
      text?: string;
      hexFid?: string | null;
      placeId?: string | null;
      decimalCid?: string | null;
    };
    const records = collectCategoryRecordsFromText(payload.text ?? '');
    const categories =
      pickMatchingCategory(records, payload.hexFid, payload.placeId, payload.decimalCid ?? null) ??
      (records.length === 1 && records[0]?.primary ? records[0] : null);
    window.postMessage(
      {
        source: NWF_SOURCE,
        type: 'NWF_PARSED_CATEGORIES',
        requestId: data.requestId,
        categories,
      },
      '*'
    );
    return;
  }

  if (data.type === 'NWF_GET_CATEGORIES_BULK') {
    const records = readAllCategories();
    window.postMessage(
      {
        source: NWF_SOURCE,
        type: 'NWF_CATEGORIES_BULK',
        requestId: data.requestId,
        records,
      },
      '*'
    );
    return;
  }

  if (data.type === 'NWF_GET_IDENTIFIERS_BULK') {
    const records = readAllIdentifiers();
    window.postMessage(
      {
        source: NWF_SOURCE,
        type: 'NWF_IDENTIFIERS_BULK',
        requestId: data.requestId,
        records,
      },
      '*'
    );
    return;
  }

  if (data.type === 'NWF_GET_NEGATIVE_REVIEW_COUNT') {
    const payload = data as { decimalCid?: string | null };
    const negativeReviewCount = readNegativeReviewCountFromState(
      data.hexFid,
      data.placeId,
      payload.decimalCid ?? null
    );
    window.postMessage(
      {
        source: NWF_SOURCE,
        type: 'NWF_NEGATIVE_REVIEW_COUNT',
        requestId: data.requestId,
        negativeReviewCount,
      },
      '*'
    );
  }
});

export {};
