import { useEffect, useMemo, useState } from 'react';
import { formatSessionDate } from '../scan-sessions/naming';
import type { LocalScanSession } from '../local-scan/types';
import { useScanSessions } from '../hooks/useScanSessions';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';
import AuditQueueBar from '../components/AuditQueueBar';

function FreePlanHistoryNotice() {
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-header">
        <h2>History not available on Free plan</h2>
      </div>
      <p className="dashboard-empty" style={{ textAlign: 'left' }}>
        Scan results and Local Scan reports are temporary on the free plan and cleared when you close
        your browser. Upgrade to Lifetime for persistent history across devices.
      </p>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          void chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS', tab: 'account' });
        }}
      >
        Upgrade to Lifetime
      </button>
    </section>
  );
}

export default function DashboardTab() {
  const { plan } = usePlanCapabilities();
  const { sessions, loading, loadSession } = useScanSessions();
  const [localScans, setLocalScans] = useState<LocalScanSession[]>([]);
  const [localLoading, setLocalLoading] = useState(true);

  useEffect(() => {
    if (plan === 'free') {
      setLocalScans([]);
      setLocalLoading(false);
      return;
    }

    chrome.runtime
      .sendMessage({ type: 'LIST_LOCAL_SCANS' })
      .then((res: { sessions?: LocalScanSession[] }) => {
        setLocalScans(res?.sessions ?? []);
      })
      .finally(() => setLocalLoading(false));
  }, [plan]);

  const recent = sessions.slice(0, 10);

  const stats = useMemo(() => {
    const totalLeads = sessions.reduce((sum, session) => sum + session.results.length, 0);
    const completeScans = sessions.filter((session) => session.status === 'complete').length;
    return { totalLeads, completeScans };
  }, [sessions]);

  if (plan === 'free') {
    return (
      <div className="dashboard-tab">
        <FreePlanHistoryNotice />
        <AuditQueueBar />
        <p className="dashboard-hint">
          Start a new scan from the extension popup. Results stay available until you close the browser.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-tab">
      <section className="dashboard-stats">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Saved scans</span>
          <strong className="dashboard-stat-value">{loading ? '…' : sessions.length}</strong>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Total leads saved</span>
          <strong className="dashboard-stat-value">{loading ? '…' : stats.totalLeads}</strong>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Completed scans</span>
          <strong className="dashboard-stat-value">{loading ? '…' : stats.completeScans}</strong>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Local Scans</span>
          <strong className="dashboard-stat-value">{localLoading ? '…' : localScans.length}</strong>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Quick actions</h2>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void chrome.tabs.create({
                url: chrome.runtime.getURL('src/results/index.html'),
                active: true,
              });
            }}
          >
            View current results
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_SCAN_LATEST' });
            }}
          >
            Open latest Local Scan
          </button>
        </div>
        <p className="dashboard-hint">
          Start a new scan from the extension popup. Saved scans and settings live in the History and
          Settings tabs.
        </p>
      </section>

      <AuditQueueBar />

      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Recent scans</h2>
          {!loading && sessions.length > 10 ? (
            <span className="dashboard-section-meta">{sessions.length} total — open History for all</span>
          ) : null}
        </div>

        {loading ? (
          <p className="dashboard-empty">Loading recent scans…</p>
        ) : recent.length === 0 ? (
          <p className="dashboard-empty">
            No saved scans yet. Each scan is saved automatically (e.g. <em>Miami plumbers – Mar 2026</em>).
          </p>
        ) : (
          <ul className="dashboard-recent-list">
            {recent.map((session) => (
              <li key={session.id}>
                <button type="button" className="dashboard-recent-item" onClick={() => void loadSession(session.id)}>
                  <span className="dashboard-recent-name">{session.name}</span>
                  <span className="dashboard-recent-meta">
                    {session.results.length} leads · {formatSessionDate(session.completedAt ?? session.startedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
