export type AuditQueueKind = 'scan' | 'standalone';

export type AuditQueueItemStatus = 'queued' | 'running' | 'done' | 'error';

export interface AuditQueueItem {
  key: string;
  kind: AuditQueueKind;
  name: string;
  status: AuditQueueItemStatus;
  openWhenDone: boolean;
  score: number | null;
  completedAt: string | null;
}

export interface AuditQueueSnapshot {
  items: AuditQueueItem[];
  running: AuditQueueItem | null;
  queuedCount: number;
  /** Audits still waiting (excludes the one currently running). */
  remainingCount: number;
  activeCount: number;
}

export function emptyAuditQueueSnapshot(): AuditQueueSnapshot {
  return {
    items: [],
    running: null,
    queuedCount: 0,
    remainingCount: 0,
    activeCount: 0,
  };
}

export function buildAuditQueueSnapshot(items: AuditQueueItem[]): AuditQueueSnapshot {
  const pruned = pruneStaleDoneItems(items);
  const running = pruned.find((item) => item.status === 'running') ?? null;
  const queuedCount = pruned.filter((item) => item.status === 'queued').length;
  return {
    items: pruned,
    running,
    queuedCount,
    remainingCount: queuedCount,
    activeCount: pruned.filter((item) => item.status === 'queued' || item.status === 'running').length,
  };
}

const DONE_TTL_MS = 90_000;

export function pruneStaleDoneItems(items: AuditQueueItem[]): AuditQueueItem[] {
  const now = Date.now();
  return items.filter((item) => {
    if (item.status !== 'done' && item.status !== 'error') return true;
    if (!item.completedAt) return false;
    return now - new Date(item.completedAt).getTime() < DONE_TTL_MS;
  });
}
