import type { LocalScanSession } from './types';
import { emptyLocalScanStore, type LocalScanStore } from './types';
import {
  readScopedHistoryValue,
  writeScopedHistoryValue,
} from '../storage/history-scope';

export const LOCAL_SCAN_STORE_KEY = 'localScanStore' as const;
export const LOCAL_SCAN_CACHE_KEY = 'localScanCache' as const;
const MAX_SESSIONS = 50;
const MAX_CACHE_ENTRIES = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function readLocalScanStore(): Promise<LocalScanStore> {
  const stored = await readScopedHistoryValue<LocalScanStore>(LOCAL_SCAN_STORE_KEY);
  if (!stored?.sessions || !Array.isArray(stored.sessions)) {
    return emptyLocalScanStore();
  }
  return {
    sessions: stored.sessions.filter((s) => Boolean(s?.id && s?.businesses)),
    latestSessionId: stored.latestSessionId ?? null,
  };
}

export async function listLocalScanSessions(): Promise<LocalScanSession[]> {
  const store = await readLocalScanStore();
  return store.sessions;
}

export async function saveLocalScanSession(session: LocalScanSession): Promise<LocalScanStore> {
  return enqueue(async () => {
    const store = await readLocalScanStore();
    store.sessions = store.sessions.filter((s) => s.id !== session.id);
    store.sessions.unshift(session);
    if (store.sessions.length > MAX_SESSIONS) {
      store.sessions = store.sessions.slice(0, MAX_SESSIONS);
    }
    store.latestSessionId = session.id;
    await writeScopedHistoryValue(LOCAL_SCAN_STORE_KEY, store);
    chrome.runtime.sendMessage({ type: 'LOCAL_SCAN_STORE_UPDATE', store }).catch(() => {});
    return store;
  });
}

export async function deleteLocalScanSession(sessionId: string): Promise<boolean> {
  return enqueue(async () => {
    const store = await readLocalScanStore();
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((s) => s.id !== sessionId);
    if (store.sessions.length === before) return false;
    if (store.latestSessionId === sessionId) {
      store.latestSessionId = store.sessions[0]?.id ?? null;
    }
    await writeScopedHistoryValue(LOCAL_SCAN_STORE_KEY, store);
    chrome.runtime.sendMessage({ type: 'LOCAL_SCAN_STORE_UPDATE', store }).catch(() => {});
    return true;
  });
}

export async function getLocalScanSession(sessionId: string): Promise<LocalScanSession | null> {
  const store = await readLocalScanStore();
  return store.sessions.find((s) => s.id === sessionId) ?? null;
}

export async function getLatestLocalScanSession(): Promise<LocalScanSession | null> {
  const store = await readLocalScanStore();
  if (store.latestSessionId) {
    const latest = store.sessions.find((s) => s.id === store.latestSessionId);
    if (latest) return latest;
  }
  return store.sessions[0] ?? null;
}

export function buildScanCacheKey(
  keyword: string,
  lat: number | null,
  lng: number | null,
  mode: LocalScanSession['mode']
): string {
  const latKey = lat != null ? (Math.round(lat * 100) / 100).toFixed(2) : 'na';
  const lngKey = lng != null ? (Math.round(lng * 100) / 100).toFixed(2) : 'na';
  return `${mode}|${keyword.trim().toLowerCase()}|${latKey}|${lngKey}`;
}

export async function readScanCache(): Promise<LocalScanSession[]> {
  const entries =
    (await readScopedHistoryValue<{ session: LocalScanSession; savedAt: string }[]>(
      LOCAL_SCAN_CACHE_KEY
    )) ?? [];
  const now = Date.now();
  return entries
    .filter((e) => e?.session?.id && now - Date.parse(e.savedAt) < CACHE_TTL_MS)
    .map((e) => e.session);
}

export async function getCachedScan(key: string): Promise<LocalScanSession | null> {
  const entries =
    (await readScopedHistoryValue<
      { key: string; session: LocalScanSession; savedAt: string }[]
    >(LOCAL_SCAN_CACHE_KEY)) ?? [];
  const hit = entries.find((e) => e.key === key);
  if (!hit) return null;
  if (Date.now() - Date.parse(hit.savedAt) > CACHE_TTL_MS) return null;
  return hit.session;
}

export async function saveScanCache(key: string, session: LocalScanSession): Promise<void> {
  const entries =
    (await readScopedHistoryValue<
      { key: string; session: LocalScanSession; savedAt: string }[]
    >(LOCAL_SCAN_CACHE_KEY)) ?? [];
  const filtered = entries.filter((e) => e.key !== key);
  filtered.unshift({ key, session, savedAt: new Date().toISOString() });
  await writeScopedHistoryValue(LOCAL_SCAN_CACHE_KEY, filtered.slice(0, MAX_CACHE_ENTRIES));
}
