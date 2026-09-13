import { useCallback, useState } from 'react';

export function useGbpAudit() {
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const handleAuditGbp = useCallback(async (leadId: string, openWhenDone = false) => {
    setAuditingId(leadId);
    setAuditError(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUDIT_GBP', leadId, openWhenDone });
      if (!response?.ok) {
        setAuditError(response?.error || 'Failed to start audit');
      }
    } catch (err) {
      setAuditError('Failed to start audit');
    } finally {
      setTimeout(() => {
        setAuditingId(null);
        setAuditError(null);
      }, 8000);
    }
  }, []);

  const handleRefreshAudit = useCallback(async (leadId: string) => {
    setAuditingId(leadId);
    setAuditError(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUDIT_GBP', leadId, openWhenDone: false });
      if (!response?.ok) {
        setAuditError(response?.error || 'Failed to refresh audit');
      }
    } catch (err) {
      setAuditError('Failed to refresh audit');
    } finally {
      setTimeout(() => {
        setAuditingId(null);
        setAuditError(null);
      }, 8000);
    }
  }, []);

  const handleViewAudit = useCallback(async (leadId: string) => {
    await chrome.runtime.sendMessage({ type: 'OPEN_AUDIT', leadId });
  }, []);

  return { auditingId, auditError, handleAuditGbp, handleRefreshAudit, handleViewAudit };
}
