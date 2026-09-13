import { useEffect, useMemo, useState } from 'react';
import { compareLocalScanSessions } from './compare';
import { localScanPageUrl } from './open-local-scan';
import type { LocalScanSession } from './types';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

function sessionLabel(session: LocalScanSession): string {
  const mode = session.mode === 'deep' ? 'Deep' : 'Quick';
  return `${session.context.keyword} · ${mode} · ${session.businesses.length} listings · ${formatDate(session.createdAt)}`;
}

export default function HistoryPage() {
  const { plan } = usePlanCapabilities();
  const [sessions, setSessions] = useState<LocalScanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');

  const load = () => {
    if (plan === 'free') {
      setSessions([]);
      setLoading(false);
      return;
    }

    chrome.runtime
      .sendMessage({ type: 'LIST_LOCAL_SCANS' })
      .then((res: { sessions?: LocalScanSession[] }) => {
        const list = res?.sessions ?? [];
        setSessions(list);
        setIdA(list[0]?.id ?? '');
        setIdB(list[1]?.id ?? '');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [plan]);

  const comparison = useMemo(() => {
    const a = sessions.find((s) => s.id === idA);
    const b = sessions.find((s) => s.id === idB);
    if (!a || !b || a.id === b.id) return null;
    return compareLocalScanSessions(a, b);
  }, [sessions, idA, idB]);

  if (loading) {
    return <div className="local-scan-page local-scan-loading">Loading Local Scan history…</div>;
  }

  if (plan === 'free') {
    return (
      <div className="local-scan-page">
        <header className="local-scan-header">
          <div>
            <h1>Local Scan History</h1>
            <p className="local-scan-meta">
              Local Scan history is not available on the free plan. Reports are temporary and cleared
              when you close your browser.
            </p>
          </div>
        </header>
        <section className="local-scan-panel local-scan-section-gap">
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
      </div>
    );
  }

  return (
    <div className="local-scan-page">
      <header className="local-scan-header">
        <div>
          <h1>Local Scan History</h1>
          <p className="local-scan-meta">
            Reopen past competitive scans, compare runs, and export saved reports.
          </p>
        </div>
        <div className="local-scan-actions">
          <a className="btn-secondary" href={chrome.runtime.getURL('src/results/index.html')}>
            Results
          </a>
        </div>
      </header>

      <section className="local-scan-panel local-scan-section-gap">
        <h2 className="local-scan-subheading">Compare scans</h2>
        {sessions.length < 2 ? (
          <p className="local-scan-meta">Run at least two Local Scans to compare them.</p>
        ) : (
          <>
            <div className="local-scan-compare-picker">
              <label>
                First scan
                <select value={idA} onChange={(e) => setIdA(e.target.value)}>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Second scan
                <select value={idB} onChange={(e) => setIdB(e.target.value)}>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {comparison ? (
              <>
                <div className="local-scan-stats">
                  <div className="local-scan-stat">
                    <div className="local-scan-stat-label">{comparison.sessionA.context.keyword}</div>
                    <div className="local-scan-stat-value">{comparison.statsA.businessCount} listings</div>
                    <div className="local-scan-meta">Avg rating {comparison.statsA.avgRating ?? '—'}</div>
                  </div>
                  <div className="local-scan-stat">
                    <div className="local-scan-stat-label">{comparison.sessionB.context.keyword}</div>
                    <div className="local-scan-stat-value">{comparison.statsB.businessCount} listings</div>
                    <div className="local-scan-meta">Avg rating {comparison.statsB.avgRating ?? '—'}</div>
                  </div>
                  <div className="local-scan-stat">
                    <div className="local-scan-stat-label">Shared businesses</div>
                    <div className="local-scan-stat-value">{comparison.sharedNames.length}</div>
                  </div>
                </div>
                {comparison.rankChanges.length > 0 ? (
                  <div className="local-scan-table-wrap local-scan-section-gap">
                    <table className="local-scan-table">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Rank A</th>
                          <th>Rank B</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rankChanges.slice(0, 15).map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.rankA ?? '—'}</td>
                            <td>{row.rankB ?? '—'}</td>
                            <td>
                              {row.delta == null
                                ? '—'
                                : row.delta === 0
                                  ? 'Same'
                                  : row.delta > 0
                                    ? `↓ ${row.delta}`
                                    : `↑ ${Math.abs(row.delta)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="local-scan-meta">Select two different scans to compare.</p>
            )}
          </>
        )}
      </section>

      <section className="local-scan-panel">
        <h2 className="local-scan-subheading">Saved scans ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <p className="local-scan-meta">
            No Local Scans saved yet. Run Quick Scan or Deep Scan from a Google Maps search results page.
          </p>
        ) : (
          <div className="local-scan-history-list">
            {sessions.map((session) => (
              <div key={session.id} className="local-scan-history-card">
                <div>
                  <div className="local-scan-history-title">{session.context.keyword}</div>
                  <div className="local-scan-meta">{sessionLabel(session)}</div>
                  {session.fromCache ? <span className="local-scan-badge">Cached</span> : null}
                </div>
                <div className="local-scan-actions">
                  <a className="btn-primary" href={localScanPageUrl(session.id)}>
                    Open
                  </a>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm('Delete this Local Scan?')) {
                        void chrome.runtime
                          .sendMessage({ type: 'DELETE_LOCAL_SCAN', sessionId: session.id })
                          .then(() => load());
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
