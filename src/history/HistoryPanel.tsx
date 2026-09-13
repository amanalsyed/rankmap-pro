import { useEffect, useMemo, useState } from 'react';
import { compareSessions } from '../scan-sessions/compare';
import { formatSessionDate } from '../scan-sessions/naming';
import type { ScanSession } from '../scan-sessions/types';
import { localScanPageUrl } from '../local-scan/open-local-scan';
import type { LocalScanSession } from '../local-scan/types';
import { useScanSessions } from '../hooks/useScanSessions';
import { useGbpAuditHistory } from '../hooks/useGbpAuditHistory';
import { historyAuditPageUrl } from '../gbp-audit/open-audit';
import type { GbpAuditHistoryEntry } from '../gbp-audit/types';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';

function formatAuditDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function GbpAuditHistorySection() {
  const { history, loading, deleteAudit } = useGbpAuditHistory();

  return (
    <section className="history-section">
      <h2>GBP Audits ({history.length})</h2>
      <p className="history-hint">
        Saved Google Business Profile audit reports from Maps and from lead scans. Re-auditing the same
        business creates a new history entry (up to 50 saved).
      </p>
      {loading ? (
        <p className="history-empty">Loading GBP audits…</p>
      ) : history.length === 0 ? (
        <p className="history-empty">
          No GBP audits saved yet. Run an audit from a Google Maps listing or from the results table.
        </p>
      ) : (
        <div className="session-list">
          {history.map((entry) => (
            <GbpAuditHistoryCard key={entry.id} entry={entry} onDelete={() => void deleteAudit(entry.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GbpAuditHistoryCard({
  entry,
  onDelete,
}: {
  entry: GbpAuditHistoryEntry;
  onDelete: () => void;
}) {
  const score = entry.audit.score;
  const category = entry.audit.snapshot.primaryCategory || '';

  return (
    <div className="session-card">
      <div className="session-card-main">
        <div className="session-card-title">{entry.name}</div>
        <div className="session-card-meta">
          {score != null ? `Score ${score}/100` : 'No score'}
          {category ? ` · ${category}` : ''}
          <br />
          {entry.source === 'scan' ? 'From lead scan' : 'From Maps'} · {formatAuditDate(entry.auditedAt)}
        </div>
        {score != null ? (
          <span className="session-status status-complete">{score}/100</span>
        ) : null}
      </div>
      <div className="session-card-actions">
        <a className="btn-primary" href={historyAuditPageUrl(entry.id)}>
          Open
        </a>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (window.confirm(`Delete audit for "${entry.name}"? This cannot be undone.`)) {
              onDelete();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function LocalScanSection() {
  const [sessions, setSessions] = useState<LocalScanSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      chrome.runtime
        .sendMessage({ type: 'LIST_LOCAL_SCANS' })
        .then((res: { sessions?: LocalScanSession[] }) => {
          setSessions(res?.sessions ?? []);
        })
        .finally(() => setLoading(false));
    };

    load();

    const onMessage = (message: { type?: string }) => {
      if (message.type === 'HISTORY_SCOPE_CHANGED' || message.type === 'LOCAL_SCAN_STORE_UPDATE') {
        load();
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  return (
    <section className="history-section">
      <div className="history-section-header">
        <h2>Local Scan ({sessions.length})</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_SCAN_HISTORY' });
          }}
        >
          Open Local Scan history
        </button>
      </div>
      <p className="history-hint">
        Competitive analysis from Google Maps search results — categories, reviews, hours, and more.
        Run Quick Scan or Deep Scan from any Maps search page.
      </p>
      {loading ? (
        <p className="history-empty">Loading Local Scans…</p>
      ) : sessions.length === 0 ? (
        <p className="history-empty">
          No Local Scans saved yet. Open a Maps search and use the Local Scan bar at the top of the results feed.
        </p>
      ) : (
        <div className="session-list">
          {sessions.slice(0, 5).map((session) => (
            <div key={session.id} className="session-card">
              <div className="session-card-main">
                <div className="session-card-title">{session.context.keyword}</div>
                <div className="session-card-meta">
                  {session.mode === 'deep' ? 'Deep scan' : 'Quick scan'} · {session.businesses.length} businesses
                  {session.fromCache ? ' · cached' : ''}
                  <br />
                  {formatSessionDate(session.createdAt)}
                </div>
              </div>
              <div className="session-card-actions">
                <a className="btn-primary" href={localScanPageUrl(session.id)}>
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: ScanSession['status']): string {
  if (status === 'complete') return 'Complete';
  if (status === 'running') return 'Running';
  if (status === 'stopped') return 'Stopped';
  return 'Error';
}

function SessionCard({
  session,
  isActive,
  onOpen,
  onDelete,
}: {
  session: ScanSession;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`session-card${isActive ? ' is-active' : ''}`}>
      <div className="session-card-main">
        <div className="session-card-title">{session.name}</div>
        <div className="session-card-meta">
          {session.params.niche} in {session.params.location}
          <br />
          {session.results.length} leads · checked {session.progress.checked} ·{' '}
          {formatSessionDate(session.completedAt ?? session.startedAt)}
        </div>
        <span className={`session-status status-${session.status}`}>{statusLabel(session.status)}</span>
      </div>
      <div className="session-card-actions">
        <button type="button" className="btn-primary" onClick={onOpen}>
          Open
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (window.confirm(`Delete "${session.name}"? This cannot be undone.`)) {
              onDelete();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ComparePanel({ sessions }: { sessions: ScanSession[] }) {
  const [idA, setIdA] = useState(sessions[0]?.id ?? '');
  const [idB, setIdB] = useState(sessions[1]?.id ?? '');

  const comparison = useMemo(() => {
    const sessionA = sessions.find((s) => s.id === idA);
    const sessionB = sessions.find((s) => s.id === idB);
    if (!sessionA || !sessionB || sessionA.id === sessionB.id) return null;
    return compareSessions(sessionA, sessionB);
  }, [sessions, idA, idB]);

  if (sessions.length < 2) {
    return <p className="history-hint">Run at least two scans to compare results over time.</p>;
  }

  return (
    <>
      <p className="history-hint">
        Pick two saved scans to see how lead counts and opportunity scores changed between runs.
      </p>
      <div className="compare-picker">
        <label>
          First scan
          <select value={idA} onChange={(e) => setIdA(e.target.value)}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Second scan
          <select value={idB} onChange={(e) => setIdB(e.target.value)}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {comparison ? (
        <>
          <div className="compare-stats">
            <div className="compare-stat-card">
              <h3>{comparison.sessionA.name}</h3>
              <div className="compare-stat-row">
                <span>Leads</span>
                <strong>{comparison.statsA.leadCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Avg opportunity</span>
                <strong>{comparison.statsA.avgOpportunityScore}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Enriched</span>
                <strong>{comparison.statsA.enrichedCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>GBP audited</span>
                <strong>{comparison.statsA.auditedCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Top 10 rank</span>
                <strong>{comparison.statsA.topRankCount}</strong>
              </div>
            </div>
            <div className="compare-stat-card">
              <h3>{comparison.sessionB.name}</h3>
              <div className="compare-stat-row">
                <span>Leads</span>
                <strong>{comparison.statsB.leadCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Avg opportunity</span>
                <strong>{comparison.statsB.avgOpportunityScore}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Enriched</span>
                <strong>{comparison.statsB.enrichedCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>GBP audited</span>
                <strong>{comparison.statsB.auditedCount}</strong>
              </div>
              <div className="compare-stat-row">
                <span>Top 10 rank</span>
                <strong>{comparison.statsB.topRankCount}</strong>
              </div>
            </div>
          </div>
          <div className="compare-overlap">
            <strong>{comparison.sharedLeadIds.length}</strong> businesses appear in both scans.{' '}
            <strong>{comparison.onlyInA}</strong> only in the first,{' '}
            <strong>{comparison.onlyInB}</strong> only in the second.
          </div>
        </>
      ) : (
        <p className="history-hint">Select two different scans to compare.</p>
      )}
    </>
  );
}

export default function HistoryPanel() {
  const { plan } = usePlanCapabilities();
  const { sessions, activeSessionId, loading, loadSession, deleteSession } = useScanSessions();

  // Free users don't get persistent history
  if (plan === 'free') {
    return (
      <div className="history-empty" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>📚 History Not Available on Free Plan</h2>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          Scan history is temporary on the free plan and cleared when you close your browser.
          Upgrade to Lifetime for persistent history across all your devices.
        </p>
        <a 
          href="#upgrade" 
          className="btn btn-primary"
          onClick={(e) => {
            e.preventDefault();
            // Open settings/account panel
            chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS', tab: 'account' }).catch(() => {});
          }}
        >
          Upgrade to Lifetime
        </a>
      </div>
    );
  }

  if (loading) {
    return <p className="history-empty">Loading scan history…</p>;
  }

  return (
    <>
      <section className="history-section">
        <h2>Compare runs</h2>
        <ComparePanel sessions={sessions} />
      </section>

      <LocalScanSection />

      <GbpAuditHistorySection />

      <section className="history-section">
        <h2>Saved sessions ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <p className="history-empty">
            No saved scans yet. Each new scan is saved automatically with a name like{' '}
            <em>Miami plumbers – Mar 2026</em>. Starting a new scan archives the previous one here.
          </p>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onOpen={() => void loadSession(session.id)}
                onDelete={() => void deleteSession(session.id)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
