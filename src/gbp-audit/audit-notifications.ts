import { auditReportUrlForQueueItem, openAuditReportForQueueItem } from './open-audit';
import type { AuditQueueItem } from './audit-queue-types';
import { notifyGoogleHostTabs } from './host-tabs';

export async function showAuditCompleteNotification(item: AuditQueueItem): Promise<void> {
  const notificationId = `audit:${item.kind}:${encodeURIComponent(item.key)}`;
  const scoreLabel =
    item.status === 'done' && typeof item.score === 'number' ? ` — Score ${item.score}/100` : '';
  const title =
    item.status === 'done' ? `GBP audit complete${scoreLabel}` : 'GBP audit finished with issues';

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
      title,
      message: `${item.name}. Click to open the audit report.`,
      priority: 1,
    });
  } catch {
    // notifications permission may be unavailable
  }
}

export function installAuditNotificationClickHandler(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId.startsWith('audit:')) return;
    const parts = notificationId.split(':');
    if (parts.length !== 3) return;
    const kind = parts[1] as 'scan' | 'standalone';
    const key = decodeURIComponent(parts[2]);
    void openAuditReportForQueueItem({ key, kind });
  });
}

export async function handleAuditQueueItemComplete(item: AuditQueueItem): Promise<void> {
  await showAuditCompleteNotification(item);
  if (item.openWhenDone && item.status === 'done') {
    await openAuditReportForQueueItem(item);
  }

  chrome.runtime
    .sendMessage({
      type: 'GBP_AUDIT_COMPLETE',
      key: item.key,
      kind: item.kind,
      name: item.name,
      score: item.score,
      status: item.status,
      reportUrl: auditReportUrlForQueueItem(item),
    })
    .catch(() => {});

  notifyGoogleHostTabs({
    type: 'GBP_AUDIT_COMPLETE',
    key: item.key,
    kind: item.kind,
    name: item.name,
    score: item.score,
    status: item.status,
    reportUrl: auditReportUrlForQueueItem(item),
  });
}