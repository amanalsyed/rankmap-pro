import { useCallback, useEffect, useState } from 'react';
import type { GbpAuditStore, StandaloneGbpAuditEntry } from '../gbp-audit/types';
import { emptyGbpAuditStore } from '../gbp-audit/types';
import { GBP_AUDIT_STORE_KEY } from '../gbp-audit/store';
import {
  isHistoryStoreKeyForBase,
  readScopedHistoryValue,
} from '../storage/history-scope';

export function useGbpAuditStore() {
  const [store, setStore] = useState<GbpAuditStore>(emptyGbpAuditStore());

  const refreshStore = useCallback(async () => {
    const stored = await readScopedHistoryValue<GbpAuditStore>(GBP_AUDIT_STORE_KEY);
    if (stored?.entries) {
      setStore(stored);
    } else {
      setStore(emptyGbpAuditStore());
    }
  }, []);

  useEffect(() => {
    void refreshStore();

    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
      const changed = Object.keys(changes).some((key) =>
        isHistoryStoreKeyForBase(key, GBP_AUDIT_STORE_KEY)
      );
      if (!changed) return;
      void refreshStore();
    };

    const onMessage = (message: { type?: string; store?: GbpAuditStore }) => {
      if (message.type === 'GBP_AUDIT_STORE_UPDATE' && message.store?.entries) {
        setStore(message.store);
        return;
      }
      if (message.type === 'HISTORY_SCOPE_CHANGED') {
        void refreshStore();
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refreshStore]);

  const getEntry = useCallback(
    (placeId: string): StandaloneGbpAuditEntry | null => store.entries[placeId] ?? null,
    [store]
  );

  return { store, refreshStore, getEntry };
}
