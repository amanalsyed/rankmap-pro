import type { AuditQueueItem } from './audit-queue-types';

export function scanAuditPageUrl(leadId: string): string {
  return `${chrome.runtime.getURL('src/audit/index.html')}?leadId=${encodeURIComponent(leadId)}`;
}

export function standaloneAuditPageUrl(placeId: string): string {
  return `${chrome.runtime.getURL('src/audit/index.html')}?placeId=${encodeURIComponent(placeId)}&mode=standalone`;
}

export function historyAuditPageUrl(auditId: string): string {
  return `${chrome.runtime.getURL('src/audit/index.html')}?auditId=${encodeURIComponent(auditId)}&mode=history`;
}

export function auditReportUrlForQueueItem(item: Pick<AuditQueueItem, 'key' | 'kind'>): string {
  if (item.kind === 'standalone') return standaloneAuditPageUrl(item.key);
  return scanAuditPageUrl(item.key);
}

export async function openScanAuditPage(leadId: string): Promise<void> {
  const target = scanAuditPageUrl(leadId);
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find(
    (tab) => tab.url?.includes('/src/audit/index.html') && tab.url?.includes(encodeURIComponent(leadId))
  );
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { url: target, active: true });
    return;
  }
  await chrome.tabs.create({ url: target, active: true });
}

export async function openStandaloneAuditPage(placeId: string): Promise<void> {
  const target = standaloneAuditPageUrl(placeId);
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find(
    (tab) => tab.url?.includes('/src/audit/index.html') && tab.url?.includes(encodeURIComponent(placeId))
  );
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { url: target, active: true });
    return;
  }
  await chrome.tabs.create({ url: target, active: true });
}

export async function openAuditReportForQueueItem(
  item: Pick<AuditQueueItem, 'key' | 'kind'>
): Promise<void> {
  if (item.kind === 'standalone') {
    await openStandaloneAuditPage(item.key);
    return;
  }
  await openScanAuditPage(item.key);
}
