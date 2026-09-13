/**
 * PARALLEL AUDIT TAB POOL - SERVICE WORKER SIDE
 * 
 * Manages multiple audit tabs for parallel deep scanning.
 * Each worker gets its own dedicated tab to avoid conflicts.
 * 
 * NOTE: This runs in the SERVICE WORKER, not content script.
 * Content scripts communicate via messages.
 */

import { prepareAuditTabAndScrape } from './audit-tab';
import { normalizeBusinessLead, type BusinessLead } from '../types';
import type { GbpProfileSnapshot } from '../audit/types';
import { normalizeMapsAuditUrl, isAuditablePlaceUrl } from './maps-url';
import type { StandaloneGbpAuditRequest } from './types';

// Pool of audit tabs (one per worker) - maintained in service worker
const auditTabPool: Map<number, number | null> = new Map(); // workerId -> tabId

/**
 * Create or reuse an audit tab for a specific worker
 * SERVICE WORKER ONLY - has access to chrome.tabs API
 */
async function ensureWorkerAuditTab(
  workerId: number,
  mapsUrl: string
): Promise<number | null> {
  const target = mapsUrl.startsWith('http')
    ? mapsUrl
    : `https://www.google.com${mapsUrl.startsWith('/') ? '' : '/'}${mapsUrl}`;
  if (!target) return null;

  const existingTabId = auditTabPool.get(workerId);

  // Try to reuse existing tab
  if (existingTabId !== null && existingTabId !== undefined) {
    try {
      await chrome.tabs.get(existingTabId);
      await chrome.tabs.update(existingTabId, { url: target, active: false });
      return existingTabId;
    } catch {
      // Tab was closed, create a new one
      auditTabPool.set(workerId, null);
    }
  }

  // Create new tab for this worker
  const tab = await chrome.tabs.create({ url: target, active: false });
  const tabId = tab.id ?? null;
  auditTabPool.set(workerId, tabId);
  return tabId;
}

/**
 * Scrape a place using a worker's dedicated audit tab
 * SERVICE WORKER ONLY - called via message from content script
 */
export async function scrapePlaceForWorker(
  request: StandaloneGbpAuditRequest,
  workerId: number
): Promise<Partial<GbpProfileSnapshot> | null> {
  const mapsUrl = normalizeMapsAuditUrl(request.mapsUrl, request.placeId);
  if (!mapsUrl || !isAuditablePlaceUrl(mapsUrl)) return null;

  // Create lead for this business (same as stubLeadFromRequest)
  const lead: BusinessLead = normalizeBusinessLead({
    id: request.placeId,
    name: request.name,
    mapsUrl,
    category: '',
    address: request.address ?? '',
    phone: request.phone ?? '',
    rating: '',
    reviews: '',
    mapsRank: null,
    hasWebsite: false,
  });

  // Get worker's dedicated tab (SERVICE WORKER creates it)
  const tabId = await ensureWorkerAuditTab(workerId, lead.mapsUrl);
  if (!tabId) return null;

  // Scrape in this worker's tab (same logic as sequential)
  let result = await prepareAuditTabAndScrape(tabId, lead);
  let snapshot = result.snapshot;

  // Retry once if hours are missing
  if (!snapshot?.hours?.trim()) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    result = await prepareAuditTabAndScrape(tabId, lead);
    snapshot = result.snapshot ?? snapshot;
  }

  return snapshot;
}

/**
 * Initialize the audit tab pool for N workers
 * SERVICE WORKER ONLY
 */
export async function initializeAuditTabPool(workerCount: number): Promise<void> {
  // Initialize pool entries
  for (let i = 1; i <= workerCount; i++) {
    auditTabPool.set(i, null);
  }
}

/**
 * Clean up all audit tabs in the pool
 * SERVICE WORKER ONLY
 */
export async function cleanupAuditTabPool(): Promise<void> {
  const tabIds = Array.from(auditTabPool.values()).filter(
    (id): id is number => id !== null
  );

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab already closed
    }
  }

  auditTabPool.clear();
}

/**
 * Get the current tab for a worker (for debugging)
 * SERVICE WORKER ONLY
 */
export function getWorkerTabId(workerId: number): number | null {
  return auditTabPool.get(workerId) ?? null;
}
