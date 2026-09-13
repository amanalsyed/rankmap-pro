import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SCAN_STATE, normalizeScanState, type ScanState } from '../types';
import {
  isHistoryStoreKeyForBase,
  readScopedHistoryValue,
} from '../storage/history-scope';

const SCAN_STATE_KEY = 'scanState' as const;

export function useScanState() {
  const [state, setState] = useState<ScanState>(DEFAULT_SCAN_STATE);

  const applyState = useCallback((next: Partial<ScanState> | ScanState | null | undefined) => {
    setState(normalizeScanState(next));
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (res?.state) {
        applyState(res.state as ScanState);
        return;
      }
    } catch {
      // Fall through to storage
    }
    const stored = await readScopedHistoryValue<ScanState>(SCAN_STATE_KEY);
    applyState(stored);
  }, [applyState]);

  useEffect(() => {
    void refreshState();

    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
      const changed = Object.keys(changes).some((key) =>
        isHistoryStoreKeyForBase(key, SCAN_STATE_KEY)
      );
      if (!changed) return;
      void refreshState();
    };

    const onMessage = (message: { type?: string; state?: ScanState }) => {
      if (message.type === 'STATE_UPDATE' && message.state) {
        applyState(message.state);
        return;
      }
      if (message.type === 'HISTORY_SCOPE_CHANGED') {
        void refreshState();
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refreshState, applyState]);

  useEffect(() => {
    if (
      state.progress.status !== 'scanning' &&
      state.progress.status !== 'paused' &&
      state.progress.status !== 'enriching'
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshState();
    }, 400);
    return () => window.clearInterval(timer);
  }, [state.progress.status, refreshState]);

  return { state, refreshState };
}
