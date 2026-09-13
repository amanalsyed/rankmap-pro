import { useCallback, useEffect, useState } from 'react';
import { emptyScanSessionStore, type ScanSessionStore } from '../scan-sessions/types';
import {
  isHistoryStoreKeyForBase,
  readScopedHistoryValue,
} from '../storage/history-scope';
import { SCAN_SESSION_STORE_KEY } from '../scan-sessions/store';

export function useScanSessions() {
  const [store, setStore] = useState<ScanSessionStore>(emptyScanSessionStore());
  const [loading, setLoading] = useState(true);

  const applyStore = useCallback((next: ScanSessionStore | null | undefined) => {
    if (!next?.sessions) {
      setStore(emptyScanSessionStore());
      return;
    }
    setStore(next);
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LIST_SCAN_SESSIONS' });
      if (res?.store) {
        applyStore(res.store as ScanSessionStore);
        return;
      }
    } catch {
      // Fall through
    }
    const stored = await readScopedHistoryValue<ScanSessionStore>(SCAN_SESSION_STORE_KEY);
    applyStore(stored);
  }, [applyStore]);

  useEffect(() => {
    void refreshSessions().finally(() => setLoading(false));

    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
      const changed = Object.keys(changes).some((key) =>
        isHistoryStoreKeyForBase(key, SCAN_SESSION_STORE_KEY)
      );
      if (!changed) return;
      void refreshSessions();
    };

    const onMessage = (message: { type?: string; store?: ScanSessionStore }) => {
      if (message.type === 'SCAN_SESSIONS_UPDATE' && message.store) {
        applyStore(message.store);
        return;
      }
      if (message.type === 'HISTORY_SCOPE_CHANGED') {
        void refreshSessions();
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refreshSessions, applyStore]);

  const loadSession = useCallback(async (sessionId: string) => {
    await chrome.runtime.sendMessage({ type: 'LOAD_SCAN_SESSION', sessionId });
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await chrome.runtime.sendMessage({ type: 'DELETE_SCAN_SESSION', sessionId });
      await refreshSessions();
    },
    [refreshSessions]
  );

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      await chrome.runtime.sendMessage({ type: 'RENAME_SCAN_SESSION', sessionId, name });
      await refreshSessions();
    },
    [refreshSessions]
  );

  const openDashboard = useCallback(async (tab: import('../dashboard/open-dashboard').DashboardTabId = 'dashboard') => {
    await chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', tab });
  }, []);

  const openHistory = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', tab: 'history' });
  }, []);

  return {
    sessions: store.sessions,
    activeSessionId: store.activeSessionId,
    loading,
    refreshSessions,
    loadSession,
    deleteSession,
    renameSession,
    openHistory,
    openDashboard,
  };
}
