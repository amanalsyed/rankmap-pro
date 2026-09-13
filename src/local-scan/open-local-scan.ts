export function localScanHistoryUrl(): string {
  return `${chrome.runtime.getURL('src/local-scan/index.html')}?view=history`;
}

export function localScanPageUrl(sessionId: string, options?: { deepOnly?: boolean }): string {
  const params = new URLSearchParams({ id: sessionId });
  if (options?.deepOnly) {
    params.set('deepOnly', '1');
  }
  return `${chrome.runtime.getURL('src/local-scan/index.html')}?${params.toString()}`;
}

export async function openLocalScanPage(
  sessionId: string,
  options?: { deepOnly?: boolean }
): Promise<void> {
  const target = localScanPageUrl(sessionId, options);
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find(
    (tab) =>
      tab.url?.includes('/src/local-scan/index.html') &&
      tab.url?.includes(encodeURIComponent(sessionId))
  );
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { url: target, active: true });
    return;
  }
  await chrome.tabs.create({ url: target, active: true });
}
