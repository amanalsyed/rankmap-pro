import { useAuditQueue } from '../hooks/useAuditQueue';
import type { AuditQueueItem } from '../gbp-audit/audit-queue-types';

function QueueItemRow({
  item,
  onToggleOpen,
  onOpenReport,
}: {
  item: AuditQueueItem;
  onToggleOpen: (open: boolean) => void;
  onOpenReport: () => void;
}) {
  if (item.status === 'done') {
    return (
      <li className="audit-queue-item audit-queue-item-done">
        <div className="audit-queue-item-main">
          <span className="audit-queue-name">{item.name}</span>
          <span className="audit-queue-meta">
            Done{typeof item.score === 'number' ? ` · ${item.score}/100` : ''}
          </span>
        </div>
        <button type="button" className="btn-secondary audit-queue-open-btn" onClick={onOpenReport}>
          Open report
        </button>
      </li>
    );
  }

  if (item.status === 'error') {
    return (
      <li className="audit-queue-item audit-queue-item-error">
        <div className="audit-queue-item-main">
          <span className="audit-queue-name">{item.name}</span>
          <span className="audit-queue-meta">Audit failed</span>
        </div>
      </li>
    );
  }

  return (
    <li className={`audit-queue-item audit-queue-item-${item.status}`}>
      <div className="audit-queue-item-main">
        <span className="audit-queue-name">{item.name}</span>
        <span className="audit-queue-meta">
          {item.status === 'running' ? 'Auditing now…' : 'Waiting in queue'}
        </span>
      </div>
      {item.status === 'queued' ? (
        <label className="audit-queue-open-toggle" title="Open the report automatically when this audit finishes">
          <input
            type="checkbox"
            checked={item.openWhenDone}
            onChange={(e) => onToggleOpen(e.target.checked)}
          />
          <span>Open when done</span>
        </label>
      ) : null}
    </li>
  );
}

export default function AuditQueueBar({ compact = false }: { compact?: boolean }) {
  const { queue, setOpenWhenDone, openReport } = useAuditQueue();

  if (queue.items.length === 0) return null;

  const headline = queue.running
    ? queue.remainingCount > 0
      ? `Auditing ${queue.running.name} · ${queue.remainingCount} remaining`
      : `Auditing ${queue.running.name}`
    : queue.queuedCount > 0
      ? `${queue.queuedCount} audit${queue.queuedCount === 1 ? '' : 's'} queued`
      : 'Recent audits';

  const visibleItems = queue.items.filter(
    (item) => item.status === 'queued' || item.status === 'running' || item.status === 'done'
  );

  if (visibleItems.length === 0) return null;

  return (
    <section className={`audit-queue-bar${compact ? ' audit-queue-bar-compact' : ''}`}>
      <div className="audit-queue-header">
        <strong>{headline}</strong>
        {queue.remainingCount > 0 ? (
          <span className="audit-queue-pill">{queue.remainingCount} remaining</span>
        ) : null}
      </div>
      {!compact ? (
        <ul className="audit-queue-list">
          {visibleItems.map((item) => (
            <QueueItemRow
              key={`${item.kind}-${item.key}`}
              item={item}
              onToggleOpen={(open) => void setOpenWhenDone(item.key, item.kind, open)}
              onOpenReport={() => void openReport(item.key, item.kind)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
