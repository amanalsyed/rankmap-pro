import type { GbpProfileSnapshot } from '../audit/types';
import type { BusinessLead } from '../types';

const POLL_MS = 300;
const PANEL_READY_MS = 12000;

export async function waitForContentScript(
  tabId: number,
  maxAttempts = 24,
  intervalMs = POLL_MS
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response?.ok) return true;
    } catch {
      // Content script not ready yet
    }
    if (intervalMs > 0 && i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, timeoutMs);
  });
}

/** Poll until the Maps place panel is ready to scrape (content script + DOM). */
export async function waitForGbpAuditReady(
  tabId: number,
  lead: BusinessLead,
  timeoutMs = PANEL_READY_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await waitForContentScript(tabId, 1, 0)) {
      try {
        const res = (await chrome.tabs.sendMessage(tabId, {
          type: 'GBP_AUDIT_PANEL_READY',
          lead,
        })) as { ready?: boolean };
        if (res?.ready) return true;
      } catch {
        // Tab may be reloading
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return false;
}

export async function runGbpAuditOnTab(
  tabId: number,
  lead: BusinessLead
): Promise<{ snapshot: Partial<GbpProfileSnapshot> | null; errorMessage: string }> {
  const ready = await waitForContentScript(tabId, 12, POLL_MS);
  if (!ready) {
    return { snapshot: null, errorMessage: 'Maps content script not ready for audit.' };
  }

  try {
    const res = (await chrome.tabs.sendMessage(tabId, { type: 'RUN_GBP_AUDIT', lead })) as {
      ok?: boolean;
      snapshot?: Partial<GbpProfileSnapshot>;
      message?: string;
    };
    if (res?.ok && res.snapshot) {
      return { snapshot: res.snapshot, errorMessage: '' };
    }
    return { snapshot: null, errorMessage: res?.message ?? 'Could not scrape GBP panel.' };
  } catch (err) {
    return {
      snapshot: null,
      errorMessage: err instanceof Error ? err.message : 'Audit scrape failed.',
    };
  }
}

/** Wait for tab load + panel readiness, then scrape once. */
export async function prepareAuditTabAndScrape(
  tabId: number,
  lead: BusinessLead
): Promise<{ snapshot: Partial<GbpProfileSnapshot> | null; errorMessage: string }> {
  await waitForTabLoad(tabId);
  await waitForGbpAuditReady(tabId, lead);
  let result = await runGbpAuditOnTab(tabId, lead);

  if (!result.snapshot) {
    await waitForGbpAuditReady(tabId, lead, 5000);
    result = await runGbpAuditOnTab(tabId, lead);
  }

  return result;
}
