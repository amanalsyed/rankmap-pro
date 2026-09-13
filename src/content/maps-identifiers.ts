/**

 * Extract stable Google Maps / GBP identifiers from URLs and live page state.

 */



import {

  isLikelyPlaceUrl,

  normalizeMapsText,

  parseLatLngFromText,

  sanitizeKnowledgeGraphId,

  sanitizePlaceId,

} from './maps-id-utils';

import { enrichIdentifiersFromMainWorld } from './maps-page-state-bridge';

export interface MapsIdentifiers {
  placeId: string | null;

  cid: string | null;

  knowledgeGraphId: string | null;

  businessProfileId: string | null;

  hexFid: string | null;

  lat: number | null;

  lng: number | null;

}



const PLACE_19_RE = /!19s(ChIJ[a-zA-Z0-9_-]+)/gi;

const FID_RE = /0x[a-f0-9]+:0x[a-f0-9]+/gi;

const KG_RE = /\/[gm]\/[a-z0-9_-]+/gi;

const LAT_LNG_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/gi;

const KG_16_RE = /!16s([^!&"']+)/gi;



function pickMostCommon(values: string[]): string | null {

  if (values.length === 0) return null;

  const counts = new Map<string, number>();

  for (const value of values) {

    counts.set(value, (counts.get(value) ?? 0) + 1);

  }

  let best = values[0];

  let bestCount = 0;

  for (const [value, count] of counts) {

    if (count > bestCount) {

      best = value;

      bestCount = count;

    }

  }

  return best;

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



function decodeKgFrom16s(encoded: string): string | null {

  const normalized = normalizeMapsText(encoded);

  try {

    const cleaned = normalized.split('?')[0].split('&')[0];

    return sanitizeKnowledgeGraphId(cleaned);

  } catch {

    return null;

  }

}



function braceMatchJson(text: string, start: number): string | null {

  const open = text[start];

  const close = open === '[' ? ']' : open === '{' ? '}' : null;

  if (!close) return null;



  let depth = 0;

  for (let i = start; i < text.length; i++) {

    const ch = text[i];

    if (ch === open) depth++;

    else if (ch === close) {

      depth--;

      if (depth === 0) return text.slice(start, i + 1);

    } else if (ch === '"') {

      i++;

      while (i < text.length && text[i] !== '"') {

        if (text[i] === '\\') i++;

        i++;

      }

    }

  }

  return null;

}



function readAppInitializationState(): unknown {

  try {

    const w = window as unknown as Record<string, unknown>;

    if (w.APP_INITIALIZATION_STATE) return w.APP_INITIALIZATION_STATE;

  } catch {

    /* restricted */

  }



  for (const script of document.querySelectorAll('script')) {

    const text = script.textContent ?? '';

    const marker = text.indexOf('APP_INITIALIZATION_STATE');

    if (marker === -1) continue;



    const eq = text.indexOf('=', marker);

    if (eq === -1) continue;



    let i = eq + 1;

    while (i < text.length && /\s/.test(text[i])) i++;

    const blob = braceMatchJson(text, i);

    if (!blob) continue;



    try {

      return JSON.parse(blob);

    } catch {

      /* try next script */

    }

  }



  return null;

}



function collectCandidateUrls(scope?: ParentNode | null): string[] {

  const urls = new Set<string>();

  urls.add(window.location.href);



  const roots: ParentNode[] = scope ? [scope, document] : [document];

  for (const root of roots) {

    root.querySelectorAll('a[href]').forEach((anchor) => {

      const href = anchor.getAttribute('href');

      if (!href) return;

      try {

        urls.add(new URL(href, window.location.origin).href);

      } catch {

        urls.add(href);

      }

    });

  }



  return [...urls].map((url) => normalizeMapsText(url));

}



function scanText(text: string, ids: MapsIdentifiers): void {

  const normalized = normalizeMapsText(text);



  for (const match of normalized.matchAll(PLACE_19_RE)) {

    const clean = sanitizePlaceId(match[1]);

    if (clean) ids.placeId = clean;

  }



  if (!ids.placeId) {

    const chijs = [...normalized.matchAll(/(ChIJ[a-zA-Z0-9_-]{10,})/g)]

      .map((m) => sanitizePlaceId(m[1]))

      .filter(Boolean) as string[];

    if (chijs.length > 0) ids.placeId = pickMostCommon(chijs);

  }



  for (const match of normalized.matchAll(FID_RE)) {

    ids.hexFid = match[0].toLowerCase();

    ids.cid = ids.cid ?? hexCidFromFid(match[0]);

  }



  for (const match of normalized.matchAll(KG_16_RE)) {

    const kg = decodeKgFrom16s(match[1]);

    if (kg) ids.knowledgeGraphId = kg;

  }



  if (!ids.knowledgeGraphId) {

    const kgMatches = [...normalized.matchAll(KG_RE)].map((m) => sanitizeKnowledgeGraphId(m[0])).filter(Boolean) as string[];

    if (kgMatches.length > 0) ids.knowledgeGraphId = pickMostCommon(kgMatches);

  }



  for (const match of normalized.matchAll(LAT_LNG_RE)) {

    ids.lat = parseFloat(match[1]);

    ids.lng = parseFloat(match[2]);

  }



  const cidParam = normalized.match(/[?&#](?:cid|ludocid)=(\d{10,})/i);

  if (cidParam) ids.cid = cidParam[1];



  const placeParam =

    normalized.match(/[?&]query_place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??

    normalized.match(/[?&]place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??

    normalized.match(/place_id:(ChIJ[a-zA-Z0-9_-]+)/i) ??

    normalized.match(/[?&]q=place_id:(ChIJ[a-zA-Z0-9_-]+)/i);

  if (placeParam) {

    const clean = sanitizePlaceId(placeParam[1]);

    if (clean) ids.placeId = clean;

  }



  const kgParam = normalized.match(/[?&]kgmid=([^&"'\\]+)/i);

  if (kgParam && !ids.knowledgeGraphId) {

    ids.knowledgeGraphId = sanitizeKnowledgeGraphId(decodeKgFrom16s(kgParam[1]) ?? kgParam[1]);

  }

}



function walkAppState(value: unknown, ids: MapsIdentifiers, depth = 0): void {

  if (depth > 28 || value == null) return;



  if (typeof value === 'string') {

    const placeId = sanitizePlaceId(value);

    if (!ids.placeId && placeId) ids.placeId = placeId;



    const kg = sanitizeKnowledgeGraphId(value);

    if (!ids.knowledgeGraphId && kg) ids.knowledgeGraphId = kg;



    if (!ids.hexFid && /^0x[a-f0-9]+:0x[a-f0-9]+$/i.test(value)) {

      ids.hexFid = value.toLowerCase();

      ids.cid = ids.cid ?? hexCidFromFid(value);

    }



    if (!ids.lat || !ids.lng) {

      const ll = parseLatLngFromText(value);

      if (ll.lat != null && ll.lng != null) {

        ids.lat = ids.lat ?? ll.lat;

        ids.lng = ids.lng ?? ll.lng;

      }

    }

    return;

  }



  if (Array.isArray(value)) {

    if (value.length >= 4) {

      const a = value[value.length - 2];

      const b = value[value.length - 1];

      if (typeof a === 'number' && typeof b === 'number' && Math.abs(a) <= 90 && Math.abs(b) <= 180) {

        if (!ids.lat || !ids.lng) {

          ids.lat = ids.lat ?? a;

          ids.lng = ids.lng ?? b;

        }

      }

    }

    value.forEach((entry) => walkAppState(entry, ids, depth + 1));

  }

}



function scanScriptTags(ids: MapsIdentifiers): void {

  for (const script of document.querySelectorAll('script')) {

    const text = script.textContent ?? '';

    if (text.length < 20 || text.length > 500000) continue;

    scanText(text, ids);



    const profileMatch = text.match(/locations\/(\d{16,20})/i);

    if (profileMatch) ids.businessProfileId = profileMatch[1];

  }

}



function extractBusinessProfileIdFromPage(state: unknown, cid: string | null): string | null {

  const fromState = extractBusinessProfileId(state, cid);

  if (fromState) return fromState;



  for (const script of document.querySelectorAll('script')) {

    const text = script.textContent ?? '';

    const loc = text.match(/locations\/(\d{16,20})/i);

    if (loc && loc[1] !== cid) return loc[1];

  }



  return null;

}



function extractBusinessProfileId(state: unknown, cid: string | null): string | null {

  const candidates = new Set<string>();



  const walk = (value: unknown, depth: number) => {

    if (depth > 30 || value == null) return;



    if (typeof value === 'string' && /^\d{16,20}$/.test(value)) {

      if (value !== cid) candidates.add(value);

      return;

    }



    if (typeof value === 'number' && Number.isInteger(value) && value >= 1e15 && value <= 1e21) {

      const asString = String(value);

      if (asString !== cid) candidates.add(asString);

      return;

    }



    if (Array.isArray(value)) {

      value.forEach((entry) => walk(entry, depth + 1));

    }

  };



  walk(state, 0);



  const sorted = [...candidates].sort((a, b) => {

    const aScore = a.length >= 18 && a.length <= 20 ? 2 : 1;

    const bScore = b.length >= 18 && b.length <= 20 ? 2 : 1;

    return bScore - aScore || b.length - a.length;

  });



  return sorted[0] ?? null;

}



export function emptyMapsIdentifiers(): MapsIdentifiers {

  return {

    placeId: null,

    cid: null,

    knowledgeGraphId: null,

    businessProfileId: null,

    hexFid: null,

    lat: null,

    lng: null,

  };

}



function finalizeIdentifiers(ids: MapsIdentifiers): MapsIdentifiers {

  ids.placeId = sanitizePlaceId(ids.placeId);

  ids.knowledgeGraphId = sanitizeKnowledgeGraphId(ids.knowledgeGraphId) ?? ids.knowledgeGraphId;

  return ids;

}



/** Extract Maps / GBP identifiers from the current page and optional panel scope. */

export function extractMapsIdentifiers(scope?: ParentNode | null): MapsIdentifiers {

  const ids = emptyMapsIdentifiers();

  const urls = collectCandidateUrls(scope);



  for (const url of urls) {

    if (!isLikelyPlaceUrl(url)) continue;

    scanText(url, ids);

    const ll = parseLatLngFromText(url);

    if (ll.lat != null && ll.lng != null) {

      ids.lat = ll.lat;

      ids.lng = ll.lng;

    }

  }



  for (const url of urls) {

    scanText(url, ids);

  }



  scanScriptTags(ids);



  const appState = readAppInitializationState();

  if (appState) {

    walkAppState(appState, ids);

  }

  ids.businessProfileId = extractBusinessProfileIdFromPage(appState, ids.cid);



  if (ids.lat == null || ids.lng == null) {

    for (const url of urls) {

      if (!isLikelyPlaceUrl(url)) continue;

      const ll = parseLatLngFromText(url);

      if (ll.lat != null && ll.lng != null) {

        ids.lat = ll.lat;

        ids.lng = ll.lng;

        break;

      }

    }

  }



  if (ids.lat == null || ids.lng == null) {

    const ll = parseLatLngFromText(window.location.href);

    ids.lat = ids.lat ?? ll.lat;

    ids.lng = ids.lng ?? ll.lng;

  }



  return finalizeIdentifiers(ids);

}

/** Same as extractMapsIdentifiers but also reads live APP_INITIALIZATION_STATE via MAIN world bridge. */
export async function extractMapsIdentifiersAsync(scope?: ParentNode | null): Promise<MapsIdentifiers> {
  const ids = extractMapsIdentifiers(scope);
  return enrichIdentifiersFromMainWorld(ids, {
    hexFid: ids.hexFid,
    placeId: ids.placeId,
    timeoutMs: 22000,
  });
}



export { sanitizePlaceId, sanitizeKnowledgeGraphId } from './maps-id-utils';


