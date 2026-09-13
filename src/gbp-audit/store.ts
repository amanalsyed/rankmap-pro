import type {
  GbpAuditHistoryEntry,
  GbpAuditHistorySource,
  GbpAuditStore,
  StandaloneGbpAuditEntry,
} from './types';
import { emptyGbpAuditStore } from './types';
import {
  readScopedHistoryValue,
  writeScopedHistoryValue,
} from '../storage/history-scope';

export const GBP_AUDIT_STORE_KEY = 'gbpAuditStore' as const;
export const MAX_GBP_AUDIT_HISTORY = 50;

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalizeStore(stored: GbpAuditStore | undefined): GbpAuditStore {
  if (!stored?.entries || typeof stored.entries !== 'object') {
    return emptyGbpAuditStore();
  }
  const history = Array.isArray(stored.history)
    ? stored.history.filter((entry) => Boolean(entry?.id && entry?.placeId && entry?.audit))
    : [];
  return { entries: stored.entries, history };
}

/** Backfill history from per-place cache (one-time for existing users). */
async function migrateLegacyEntriesIfNeeded(store: GbpAuditStore): Promise<GbpAuditStore> {
  if (store.history.length > 0) return store;

  const legacy = Object.values(store.entries).filter((entry) => entry.audit.status === 'done');
  if (legacy.length === 0) return store;

  const history = legacy
    .sort((a, b) => Date.parse(b.auditedAt) - Date.parse(a.auditedAt))
    .slice(0, MAX_GBP_AUDIT_HISTORY)
    .map((entry) => buildHistoryEntry(entry, 'standalone'));

  const next = { ...store, history };
  await writeScopedHistoryValue(GBP_AUDIT_STORE_KEY, next);
  chrome.runtime.sendMessage({ type: 'GBP_AUDIT_STORE_UPDATE', store: next }).catch(() => {});
  return next;
}

export async function readGbpAuditStore(): Promise<GbpAuditStore> {
  const stored = await readScopedHistoryValue<GbpAuditStore>(GBP_AUDIT_STORE_KEY);
  const normalized = normalizeStore(stored);
  return migrateLegacyEntriesIfNeeded(normalized);
}

export async function mutateGbpAuditStore(
  mutator: (store: GbpAuditStore) => void
): Promise<GbpAuditStore> {
  return enqueue(async () => {
    const store = await readGbpAuditStore();
    mutator(store);
    await writeScopedHistoryValue(GBP_AUDIT_STORE_KEY, store);
    chrome.runtime.sendMessage({ type: 'GBP_AUDIT_STORE_UPDATE', store }).catch(() => {});
    return store;
  });
}

export async function getStandaloneEntry(placeId: string): Promise<StandaloneGbpAuditEntry | null> {
  const store = await readGbpAuditStore();
  return store.entries[placeId] ?? null;
}

export async function upsertStandaloneEntry(entry: StandaloneGbpAuditEntry): Promise<void> {
  await mutateGbpAuditStore((store) => {
    store.entries[entry.placeId] = entry;
  });
}

export function buildHistoryEntry(
  entry: StandaloneGbpAuditEntry,
  source: GbpAuditHistorySource,
  opts: { leadId?: string } = {}
): GbpAuditHistoryEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    source,
    leadId: opts.leadId,
  };
}

export async function appendAuditHistory(
  entry: StandaloneGbpAuditEntry,
  source: GbpAuditHistorySource,
  opts: { leadId?: string } = {}
): Promise<GbpAuditHistoryEntry | null> {
  if (entry.audit.status !== 'done') return null;

  const historyEntry = buildHistoryEntry(entry, source, opts);
  await mutateGbpAuditStore((store) => {
    store.history.unshift(historyEntry);
    if (store.history.length > MAX_GBP_AUDIT_HISTORY) {
      store.history.length = MAX_GBP_AUDIT_HISTORY;
    }
  });
  return historyEntry;
}

export async function listAuditHistory(): Promise<GbpAuditHistoryEntry[]> {
  const store = await readGbpAuditStore();
  return store.history;
}

export async function getAuditHistoryById(auditId: string): Promise<GbpAuditHistoryEntry | null> {
  const store = await readGbpAuditStore();
  return store.history.find((entry) => entry.id === auditId) ?? null;
}

export async function deleteAuditHistory(auditId: string): Promise<boolean> {
  let removed = false;
  await mutateGbpAuditStore((store) => {
    const before = store.history.length;
    store.history = store.history.filter((entry) => entry.id !== auditId);
    removed = store.history.length < before;
  });
  return removed;
}
