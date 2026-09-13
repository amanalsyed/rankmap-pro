import type { MapsIdentifiers } from './maps-identifiers';

const NWF_SOURCE = 'nwf-maps-main';
const BRIDGE_SOURCE = 'nwf-maps-bridge';

interface MainWorldIdentifiers {
  placeId: string | null;
  cid: string | null;
  knowledgeGraphId: string | null;
  businessProfileId: string | null;
  hexFid: string | null;
  lat: number | null;
  lng: number | null;
}

function requestMainWorldIdentifiers(
  hexFid: string | null | undefined,
  placeId: string | null | undefined,
  timeoutMs: number
): Promise<MainWorldIdentifiers | null> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const finish = (value: MainWorldIdentifiers | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        source?: string;
        type?: string;
        requestId?: string;
        identifiers?: MainWorldIdentifiers | null;
      };
      if (
        data?.source !== NWF_SOURCE ||
        data.type !== 'NWF_IDENTIFIERS' ||
        data.requestId !== requestId
      ) {
        return;
      }
      finish(data.identifiers ?? null);
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type: 'NWF_GET_IDENTIFIERS',
        requestId,
        hexFid: hexFid ?? null,
        placeId: placeId ?? null,
      },
      '*'
    );
  });
}

function mergeIdentifierFields(
  base: MapsIdentifiers,
  fromMain: MainWorldIdentifiers | null
): MapsIdentifiers {
  if (!fromMain) return base;

  return {
    ...base,
    placeId: base.placeId ?? fromMain.placeId,
    cid: base.cid ?? fromMain.cid,
    knowledgeGraphId: base.knowledgeGraphId ?? fromMain.knowledgeGraphId,
    businessProfileId: base.businessProfileId ?? fromMain.businessProfileId,
    hexFid: base.hexFid || fromMain.hexFid || '',
    lat: base.lat ?? fromMain.lat,
    lng: base.lng ?? fromMain.lng,
  };
}

export async function enrichIdentifiersFromMainWorld(
  base: MapsIdentifiers,
  options: { hexFid?: string | null; placeId?: string | null; timeoutMs?: number } = {}
): Promise<MapsIdentifiers> {
  const timeoutMs = options.timeoutMs ?? 22000;
  const hexFid = options.hexFid ?? base.hexFid;
  const placeId = options.placeId ?? base.placeId;
  const started = Date.now();

  let merged = base;
  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;

    const fromMain = await requestMainWorldIdentifiers(hexFid, placeId, Math.min(4500, remaining));
    merged = mergeIdentifierFields(merged, fromMain);
    if (merged.businessProfileId) return merged;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return merged;
}
