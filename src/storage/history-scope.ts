/**
 * Per-account (and guest) history isolation in chrome.storage.local.
 * Physical keys: `${baseKey}:${scope}` where scope is user UUID or "guest".
 * 
 * Free users use a temporary session scope that is cleared on browser restart.
 */

export const GUEST_HISTORY_SCOPE = 'guest';
export const SESSION_TEMP_SCOPE = 'session_temp';
export const ACTIVE_HISTORY_SCOPE_KEY = 'activeHistoryScope';
export const HISTORY_LEGACY_MIGRATED_KEY = 'historyLegacyMigrated';

export const HISTORY_STORE_BASE_KEYS = [
  'scanState',
  'scanSessionStore',
  'gbpAuditStore',
  'localScanStore',
  'localScanCache',
] as const;

export type HistoryStoreBaseKey = (typeof HISTORY_STORE_BASE_KEYS)[number];

let cachedScope: string | null = null;

export function historyScopeStorageKey(baseKey: string, scope: string): string {
  return `${baseKey}:${scope}`;
}

export function isHistoryStoreKey(key: string): boolean {
  return HISTORY_STORE_BASE_KEYS.some(
    (base) => key === base || key.startsWith(`${base}:`)
  );
}

export function isHistoryStoreKeyForBase(key: string, baseKey: HistoryStoreBaseKey): boolean {
  return key === baseKey || key.startsWith(`${baseKey}:`);
}

export async function getActiveHistoryScope(): Promise<string> {
  if (cachedScope) return cachedScope;
  try {
    const data = await chrome.storage.local.get(ACTIVE_HISTORY_SCOPE_KEY);
    cachedScope = (data[ACTIVE_HISTORY_SCOPE_KEY] as string | undefined) ?? GUEST_HISTORY_SCOPE;
  } catch {
    cachedScope = GUEST_HISTORY_SCOPE;
  }
  return cachedScope;
}

export function peekActiveHistoryScope(): string {
  return cachedScope ?? GUEST_HISTORY_SCOPE;
}

export async function readScopedHistoryValue<T>(baseKey: HistoryStoreBaseKey): Promise<T | undefined> {
  const scope = await getActiveHistoryScope();
  const key = historyScopeStorageKey(baseKey, scope);
  const data = await chrome.storage.local.get(key);
  if (data[key] !== undefined) {
    return data[key] as T;
  }

  // Unsigned users may still have pre-migration unscoped data.
  if (scope === GUEST_HISTORY_SCOPE) {
    const legacy = await chrome.storage.local.get(baseKey);
    if (legacy[baseKey] !== undefined) {
      return legacy[baseKey] as T;
    }
  }

  return undefined;
}

export async function writeScopedHistoryValue<T>(
  baseKey: HistoryStoreBaseKey,
  value: T
): Promise<string> {
  const scope = await getActiveHistoryScope();
  const key = historyScopeStorageKey(baseKey, scope);
  await chrome.storage.local.set({ [key]: value });
  return key;
}

async function migrateLegacyHistoryToScope(targetScope: string): Promise<void> {
  const flagData = await chrome.storage.local.get(HISTORY_LEGACY_MIGRATED_KEY);
  if (flagData[HISTORY_LEGACY_MIGRATED_KEY]) return;

  const toSet: Record<string, unknown> = {};
  const toRemove: string[] = [];

  for (const baseKey of HISTORY_STORE_BASE_KEYS) {
    const legacy = await chrome.storage.local.get(baseKey);
    if (legacy[baseKey] === undefined) continue;

    const scopedKey = historyScopeStorageKey(baseKey, targetScope);
    const existing = await chrome.storage.local.get(scopedKey);
    if (existing[scopedKey] === undefined) {
      toSet[scopedKey] = legacy[baseKey];
    }
    toRemove.push(baseKey);
  }

  if (toRemove.length > 0) {
    if (Object.keys(toSet).length > 0) {
      await chrome.storage.local.set(toSet);
    }
    await chrome.storage.local.remove(toRemove);
  }

  await chrome.storage.local.set({ [HISTORY_LEGACY_MIGRATED_KEY]: true });
}

export async function setActiveHistoryScope(scope: string): Promise<void> {
  cachedScope = scope;
  await chrome.storage.local.set({ [ACTIVE_HISTORY_SCOPE_KEY]: scope });
  try {
    chrome.runtime.sendMessage({ type: 'HISTORY_SCOPE_CHANGED', scope }).catch(() => {});
  } catch {
    // Ignore when runtime is unavailable
  }
}

/** Align local history partition with the signed-in user (or guest when signed out). */
export async function syncHistoryScopeWithAuth(userId: string | null, plan?: string): Promise<string> {
  // Free users always use temporary session scope (cleared on browser restart)
  if (plan === 'free') {
    const nextScope = SESSION_TEMP_SCOPE;
    const currentScope = await getActiveHistoryScope();
    if (currentScope !== nextScope) {
      await setActiveHistoryScope(nextScope);
    }
    return nextScope;
  }

  // Paid users get persistent user-scoped storage
  const nextScope = userId ?? GUEST_HISTORY_SCOPE;
  const currentScope = await getActiveHistoryScope();

  if (userId) {
    await migrateLegacyHistoryToScope(userId);
  }

  if (currentScope !== nextScope) {
    await setActiveHistoryScope(nextScope);
  }

  return nextScope;
}

export function notifyHistoryScopeChanged(scope: string): void {
  try {
    chrome.runtime.sendMessage({ type: 'HISTORY_SCOPE_CHANGED', scope }).catch(() => {});
  } catch {
    // Ignore
  }
}
