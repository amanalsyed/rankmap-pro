import { useCallback, useEffect, useState } from 'react';
import {
  emptyAuditQueueSnapshot,
  type AuditQueueSnapshot,
} from '../gbp-audit/audit-queue-types';

export function useAuditQueue() {
  const [queue, setQueue] = useState<AuditQueueSnapshot>(emptyAuditQueueSnapshot());

  const applyQueue = useCallback((next: AuditQueueSnapshot | null | undefined) => {
    if (!next) {
      setQueue(emptyAuditQueueSnapshot());
      return;
    }
    setQueue(next);
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_AUDIT_QUEUE' });
      if (res?.queue) {
        applyQueue(res.queue as AuditQueueSnapshot);
      }
    } catch {
      // ignore
    }
  }, [applyQueue]);

  useEffect(() => {
    void refreshQueue();

    const onMessage = (message: { type?: string; queue?: AuditQueueSnapshot }) => {
      if (message.type === 'AUDIT_QUEUE_UPDATE' && message.queue) {
        applyQueue(message.queue);
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    const timer = window.setInterval(() => void refreshQueue(), 2000);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      window.clearInterval(timer);
    };
  }, [refreshQueue, applyQueue]);

  const setOpenWhenDone = useCallback(
    async (key: string, kind: 'scan' | 'standalone', openWhenDone: boolean) => {
      await chrome.runtime.sendMessage({
        type: 'SET_AUDIT_OPEN_WHEN_DONE',
        key,
        kind,
        openWhenDone,
      });
      await refreshQueue();
    },
    [refreshQueue]
  );

  const openReport = useCallback(async (key: string, kind: 'scan' | 'standalone') => {
    await chrome.runtime.sendMessage({ type: 'OPEN_AUDIT_REPORT', key, kind });
  }, []);

  return { queue, refreshQueue, setOpenWhenDone, openReport };
}
