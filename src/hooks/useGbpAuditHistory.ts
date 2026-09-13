import { useCallback, useEffect, useState } from 'react';
import type { GbpAuditHistoryEntry } from '../gbp-audit/types';
import { GBP_AUDIT_STORE_KEY } from '../gbp-audit/store';
import {
  isHistoryStoreKeyForBase,
  readScopedHistoryValue,
} from '../storage/history-scope';

export function useGbpAuditHistory() {
  const [history, setHistory] = useState<GbpAuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshHistory = useCallback(async () => {
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'LIST_GBP_AUDIT_HISTORY' })) as {
        history?: GbpAuditHistoryEntry[];
      };
      setHistory(res?.history ?? []);
      return;
    } catch {
      // Fall through to storage
    }

    const store = await readScopedHistoryValue<{ history?: GbpAuditHistoryEntry[] }>(
      GBP_AUDIT_STORE_KEY
    );
    setHistory(Array.isArray(store?.history) ? store.history : []);
  }, []);

  useEffect(() => {
    void refreshHistory().finally(() => setLoading(false));

    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
      const changed = Object.keys(changes).some((key) =>
        isHistoryStoreKeyForBase(key, GBP_AUDIT_STORE_KEY)
      );
      if (!changed) return;
      void refreshHistory();
    };

    const onMessage = (message: { type?: string; store?: { history?: GbpAuditHistoryEntry[] } }) => {
      if (message.type === 'GBP_AUDIT_STORE_UPDATE' && Array.isArray(message.store?.history)) {
        setHistory(message.store.history);
        return;
      }
      if (message.type === 'HISTORY_SCOPE_CHANGED') {
        void refreshHistory();
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refreshHistory]);

  const deleteAudit = useCallback(
    async (auditId: string) => {
      await chrome.runtime.sendMessage({ type: 'DELETE_GBP_AUDIT_HISTORY', auditId });
      await refreshHistory();
    },
    [refreshHistory]
  );

  return { history, loading, refreshHistory, deleteAudit };
}
