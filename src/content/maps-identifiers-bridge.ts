const NWF_SOURCE = 'nwf-maps-main';
const BRIDGE_SOURCE = 'nwf-maps-bridge';
const CID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;

export interface IdentifierRecord {
  hexFid: string;
  placeId: string | null;
  cid: string | null;
  lat: number | null;
  lng: number | null;
}

export interface IdentifierLookupMaps {
  byHexFid: Map<string, IdentifierRecord>;
  byPlaceId: Map<string, IdentifierRecord>;
  byCid: Map<string, IdentifierRecord>;
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

function recordsToMaps(records: IdentifierRecord[]): IdentifierLookupMaps {
  const byHexFid = new Map<string, IdentifierRecord>();
  const byPlaceId = new Map<string, IdentifierRecord>();
  const byCid = new Map<string, IdentifierRecord>();

  for (const record of records) {
    byHexFid.set(record.hexFid.toLowerCase(), record);
    if (record.placeId?.startsWith('ChIJ')) {
      byPlaceId.set(record.placeId, record);
    }
    if (record.cid) {
      byCid.set(record.cid, record);
    }
  }

  return { byHexFid, byPlaceId, byCid };
}

function mapsHasData(maps: IdentifierLookupMaps): boolean {
  return maps.byHexFid.size > 0 || maps.byPlaceId.size > 0 || maps.byCid.size > 0;
}

function emptyMaps(): IdentifierLookupMaps {
  return { byHexFid: new Map(), byPlaceId: new Map(), byCid: new Map() };
}

let cachedMaps: IdentifierLookupMaps | null = null;
let cacheUpdatedAt = 0;
let bulkFetchPromise: Promise<IdentifierLookupMaps> | null = null;

async function requestIdentifiersBulk(timeoutMs: number): Promise<IdentifierLookupMaps> {
  const started = Date.now();
  let records: IdentifierRecord[] | null = null;

  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;

    records = await postMessageRequest<IdentifierRecord[]>(
      'NWF_GET_IDENTIFIERS_BULK',
      'NWF_IDENTIFIERS_BULK',
      {},
      Math.min(4500, remaining),
      (data) => (Array.isArray(data.records) ? (data.records as IdentifierRecord[]) : null)
    );

    if (records && records.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return recordsToMaps(records ?? []);
}

export async function fetchAllIdentifiersFromMainWorld(
  options: { force?: boolean; timeoutMs?: number; maxAgeMs?: number } = {}
): Promise<IdentifierLookupMaps> {
  const maxAgeMs = options.maxAgeMs ?? 2500;
  const timeoutMs = options.timeoutMs ?? 6000;

  if (!options.force && cachedMaps && mapsHasData(cachedMaps) && Date.now() - cacheUpdatedAt < maxAgeMs) {
    return cachedMaps;
  }

  if (bulkFetchPromise) return bulkFetchPromise;

  bulkFetchPromise = requestIdentifiersBulk(timeoutMs)
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

export async function fetchIdentifiersForListing(
  hexFid: string | null | undefined,
  placeId: string | null | undefined,
  options: {
    timeoutMs?: number;
    decimalCid?: string | null;
    bypassBulkCache?: boolean;
  } = {}
): Promise<IdentifierRecord | null> {
  if (!options.bypassBulkCache) {
    const maps = await fetchAllIdentifiersFromMainWorld({
      timeoutMs: options.timeoutMs ?? 6000,
      force: !mapsHasData(cachedMaps ?? emptyMaps()),
    });

    const lookup = lookupIdentifiersFromCache(
      maps,
      hexFid ?? null,
      placeId ?? null,
      options.decimalCid ?? null
    );
    if (lookup?.lat != null && lookup.lng != null) return lookup;
  }

  const normalizedHex =
    hexFid?.toLowerCase() ?? (placeId && CID_RE.test(placeId) ? placeId.toLowerCase() : null);
  const normalizedPlace = placeId?.startsWith('ChIJ') ? placeId : null;

  if (!normalizedHex && !normalizedPlace) return null;

  const single = await postMessageRequest<IdentifierRecord>(
    'NWF_GET_IDENTIFIERS',
    'NWF_IDENTIFIERS',
    {
      hexFid: normalizedHex,
      placeId: normalizedPlace,
    },
    options.timeoutMs ?? 6000,
    (data) => {
      const ids = data.identifiers as IdentifierRecord | null | undefined;
      if (!ids?.hexFid) return null;
      return {
        hexFid: ids.hexFid.toLowerCase(),
        placeId: ids.placeId ?? null,
        cid: ids.cid ?? options.decimalCid ?? null,
        lat: ids.lat ?? null,
        lng: ids.lng ?? null,
      };
    }
  );

  if (!single) return null;

  cachedMaps ??= emptyMaps();
  cachedMaps.byHexFid.set(single.hexFid.toLowerCase(), single);
  if (single.placeId?.startsWith('ChIJ')) {
    cachedMaps.byPlaceId.set(single.placeId, single);
  }
  if (single.cid) {
    cachedMaps.byCid.set(single.cid, single);
  }
  cacheUpdatedAt = Date.now();

  return single;
}

export function lookupIdentifiersFromCache(
  maps: IdentifierLookupMaps,
  hexFid: string | null,
  placeId: string | null,
  decimalCid: string | null = null
): IdentifierRecord | null {
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

  return null;
}

export { emptyMaps as emptyIdentifierMaps, mapsHasData as identifierMapsHasData };
