import {
  buildAuditQueueSnapshot,
  pruneStaleDoneItems,
  type AuditQueueItem,
  type AuditQueueKind,
  type AuditQueueSnapshot,
} from './audit-queue-types';
import { notifyGoogleHostTabs } from './host-tabs';

const queueItems: AuditQueueItem[] = [];

function findIndex(key: string, kind: AuditQueueKind): number {
  return queueItems.findIndex((item) => item.key === key && item.kind === kind);
}

export function getAuditQueueSnapshot(): AuditQueueSnapshot {
  return buildAuditQueueSnapshot(queueItems);
}

export function broadcastAuditQueueUpdate(): void {
  const snapshot = getAuditQueueSnapshot();
  chrome.runtime
    .sendMessage({ type: 'AUDIT_QUEUE_UPDATE', queue: snapshot })
    .catch(() => {});
  notifyGoogleHostTabs({ type: 'AUDIT_QUEUE_UPDATE', queue: snapshot });
}

export function enqueueAuditQueueItem(input: {
  key: string;
  kind: AuditQueueKind;
  name: string;
  openWhenDone?: boolean;
}): void {
  const existing = findIndex(input.key, input.kind);
  if (existing >= 0 && queueItems[existing].status !== 'done' && queueItems[existing].status !== 'error') {
    if (input.openWhenDone) queueItems[existing].openWhenDone = true;
    broadcastAuditQueueUpdate();
    return;
  }

  queueItems.push({
    key: input.key,
    kind: input.kind,
    name: input.name,
    status: 'queued',
    openWhenDone: input.openWhenDone ?? false,
    score: null,
    completedAt: null,
  });
  pruneInPlace();
  broadcastAuditQueueUpdate();
}

export function setAuditQueueOpenWhenDone(
  key: string,
  kind: AuditQueueKind,
  openWhenDone: boolean
): void {
  const idx = findIndex(key, kind);
  if (idx < 0) return;
  if (queueItems[idx].status !== 'queued') return;
  queueItems[idx].openWhenDone = openWhenDone;
  broadcastAuditQueueUpdate();
}

export function markAuditQueueRunning(key: string, kind: AuditQueueKind): void {
  const idx = findIndex(key, kind);
  if (idx >= 0) {
    queueItems[idx].status = 'running';
  }
  broadcastAuditQueueUpdate();
}

export function markAuditQueueFinished(input: {
  key: string;
  kind: AuditQueueKind;
  status: 'done' | 'error';
  score?: number | null;
}): AuditQueueItem | null {
  const idx = findIndex(input.key, input.kind);
  if (idx < 0) return null;

  const item = queueItems[idx];
  item.status = input.status;
  item.score = input.score ?? null;
  item.completedAt = new Date().toISOString();
  pruneInPlace();
  broadcastAuditQueueUpdate();
  return item;
}

export function clearAuditQueueItem(key: string, kind: AuditQueueKind): void {
  const idx = findIndex(key, kind);
  if (idx < 0) return;
  queueItems.splice(idx, 1);
  broadcastAuditQueueUpdate();
}

function pruneInPlace(): void {
  const pruned = pruneStaleDoneItems(queueItems);
  queueItems.length = 0;
  queueItems.push(...pruned);
}
