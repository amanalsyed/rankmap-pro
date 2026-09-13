import {
  normalizeBusinessLead,
  normalizeScanState,
  type ScanProgress,
  type ScanParams,
  type ScanState,
} from '../types';
import {
  readScopedHistoryValue,
  writeScopedHistoryValue,
} from '../storage/history-scope';
import { generateSessionName, generateBatchSessionName } from './naming';
import {
  emptyScanSessionStore,
  type ScanSession,
  type ScanSessionStatus,
  type ScanSessionStore,
} from './types';

export const SCAN_SESSION_STORE_KEY = 'scanSessionStore' as const;
export const MAX_SCAN_SESSIONS = 30;

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function mapProgressToSessionStatus(
  status: ScanProgress['status']
): ScanSessionStatus {
  if (status === 'error') return 'error';
  if (status === 'scanning' || status === 'paused' || status === 'enriching') return 'running';
  if (status === 'idle') return 'stopped';
  return 'complete';
}

export async function readScanSessionStore(): Promise<ScanSessionStore> {
  const stored = await readScopedHistoryValue<ScanSessionStore>(SCAN_SESSION_STORE_KEY);
  if (!stored?.sessions || !Array.isArray(stored.sessions)) {
    return emptyScanSessionStore();
  }
  return {
    sessions: stored.sessions.filter((s) => Boolean(s?.id && s?.params)),
    activeSessionId: stored.activeSessionId ?? null,
  };
}

export async function mutateScanSessionStore(
  mutator: (store: ScanSessionStore) => void
): Promise<ScanSessionStore> {
  return enqueue(async () => {
    const store = await readScanSessionStore();
    mutator(store);
    await writeScopedHistoryValue(SCAN_SESSION_STORE_KEY, store);
    chrome.runtime.sendMessage({ type: 'SCAN_SESSIONS_UPDATE', store }).catch(() => {});
    return store;
  });
}

export async function getScanSession(sessionId: string): Promise<ScanSession | null> {
  const store = await readScanSessionStore();
  return store.sessions.find((s) => s.id === sessionId) ?? null;
}

export async function createSession(params: ScanParams): Promise<ScanSession> {
  const session: ScanSession = {
    id: crypto.randomUUID(),
    name: generateSessionName(params),
    params,
    results: [],
    progress: {
      status: 'scanning',
      checked: 0,
      withoutWebsite: 0,
      target: params.count,
      enriching: 0,
    },
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  await mutateScanSessionStore((store) => {
    store.sessions.unshift(session);
    if (store.sessions.length > MAX_SCAN_SESSIONS) {
      store.sessions = store.sessions.slice(0, MAX_SCAN_SESSIONS);
    }
    store.activeSessionId = session.id;
  });

  return session;
}

export async function createBatchSession(
  niche: string,
  cities: string[],
  countPerCity: number
): Promise<ScanSession> {
  const session: ScanSession = {
    id: crypto.randomUUID(),
    name: generateBatchSessionName(niche, cities.length),
    params: {
      niche,
      location: cities.join(' · '),
      count: countPerCity,
    },
    results: [],
    progress: {
      status: 'scanning',
      checked: 0,
      withoutWebsite: 0,
      target: countPerCity,
      enriching: 0,
      batchCity: cities[0],
      batchCityIndex: 1,
      batchCityTotal: cities.length,
    },
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  await mutateScanSessionStore((store) => {
    store.sessions.unshift(session);
    if (store.sessions.length > MAX_SCAN_SESSIONS) {
      store.sessions = store.sessions.slice(0, MAX_SCAN_SESSIONS);
    }
    store.activeSessionId = session.id;
  });

  return session;
}

export async function syncActiveSession(
  state: ScanState,
  overrideStatus?: ScanSessionStatus
): Promise<void> {
  if (!state.sessionId || state.viewingArchived || !state.params) return;

  const status = overrideStatus ?? mapProgressToSessionStatus(state.progress.status);
  const normalized = normalizeScanState(state);
  const now = new Date().toISOString();

  await mutateScanSessionStore((store) => {
    const idx = store.sessions.findIndex((s) => s.id === state.sessionId);
    const existing = idx >= 0 ? store.sessions[idx] : null;

    const updated: ScanSession = {
      id: state.sessionId!,
      name: state.sessionName ?? existing?.name ?? generateSessionName(state.params!),
      params: state.params!,
      results: normalized.results,
      progress: { ...normalized.progress },
      status,
      startedAt: existing?.startedAt ?? now,
      completedAt: status === 'running' ? null : existing?.completedAt ?? now,
    };

    if (idx >= 0) store.sessions[idx] = updated;
    else store.sessions.unshift(updated);

    if (store.sessions.length > MAX_SCAN_SESSIONS) {
      store.sessions = store.sessions.slice(0, MAX_SCAN_SESSIONS);
    }
    store.activeSessionId = state.sessionId ?? null;
  });
}

export async function archiveCurrentScanIfNeeded(state: ScanState): Promise<void> {
  if (!state.sessionId || state.viewingArchived) return;
  if (state.results.length === 0 && state.progress.status === 'idle') return;

  const status = mapProgressToSessionStatus(state.progress.status);
  await syncActiveSession(state, status === 'running' ? 'stopped' : status);
}

export function sessionToScanState(session: ScanSession): ScanState {
  return normalizeScanState({
    params: session.params,
    results: session.results.map((lead) => normalizeBusinessLead(lead)),
    progress: session.progress,
    sessionId: session.id,
    sessionName: session.name,
    viewingArchived: true,
  });
}

export async function loadSessionIntoState(sessionId: string): Promise<ScanState | null> {
  const session = await getScanSession(sessionId);
  if (!session) return null;
  return sessionToScanState(session);
}

export async function deleteScanSession(sessionId: string): Promise<void> {
  await mutateScanSessionStore((store) => {
    store.sessions = store.sessions.filter((s) => s.id !== sessionId);
    if (store.activeSessionId === sessionId) store.activeSessionId = null;
  });
}

export async function renameScanSession(sessionId: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;

  await mutateScanSessionStore((store) => {
    const session = store.sessions.find((s) => s.id === sessionId);
    if (session) session.name = trimmed;
  });
  return true;
}
