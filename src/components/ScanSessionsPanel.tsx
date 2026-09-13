import { formatSessionDate } from '../scan-sessions/naming';
import { useScanSessions } from '../hooks/useScanSessions';

interface ScanSessionsPanelProps {
  compact?: boolean;
  currentSessionId?: string | null;
  viewingArchived?: boolean;
}

export default function ScanSessionsPanel({
  compact = false,
  currentSessionId,
  viewingArchived = false,
}: ScanSessionsPanelProps) {
  const { sessions, loading, loadSession, openHistory } = useScanSessions();
  const recent = sessions.slice(0, compact ? 3 : 5);

  if (loading && sessions.length === 0) return null;

  return (
    <section className={`scan-sessions-panel${compact ? ' scan-sessions-compact' : ''}`}>
      <div className="scan-sessions-header">
        <h2>{compact ? 'Recent scans' : 'Scan sessions'}</h2>
        <button type="button" className="btn-link" onClick={() => void openHistory()}>
          {compact ? 'All history' : 'Open history'}
        </button>
      </div>

      {viewingArchived ? (
        <p className="scan-sessions-note">
          Viewing a saved scan from history. Start a new search to run a fresh scan — your saved sessions
          stay here.
        </p>
      ) : null}

      {recent.length === 0 ? (
        <p className="scan-sessions-empty">
          Scans are saved automatically (e.g. <em>Miami plumbers – Mar 2026</em>).
        </p>
      ) : (
        <ul className="scan-sessions-list">
          {recent.map((session) => {
            const isCurrent = session.id === currentSessionId;
            return (
              <li key={session.id} className={isCurrent ? 'is-current' : undefined}>
                <button
                  type="button"
                  className="scan-session-item"
                  onClick={() => void loadSession(session.id)}
                  disabled={isCurrent && !viewingArchived}
                >
                  <span className="scan-session-name">{session.name}</span>
                  <span className="scan-session-meta">
                    {session.results.length} leads · {formatSessionDate(session.completedAt ?? session.startedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
