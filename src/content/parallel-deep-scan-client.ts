/**
 * PARALLEL DEEP SCAN CLIENT - CONTENT SCRIPT SIDE
 * 
 * Content scripts cannot access chrome.tabs API directly.
 * This file provides a messaging wrapper that communicates with the service worker.
 */

import type { GbpProfileSnapshot } from '../audit/types';
import type { StandaloneGbpAuditRequest } from '../gbp-audit/types';
import { safeRuntimeSendMessage } from './extension-context';
import { sleep } from './dom-utils';

/**
 * Scrape a place using a worker's dedicated audit tab
 * Sends message to service worker which manages the tabs
 */
export async function scrapePlaceForWorker(
  request: StandaloneGbpAuditRequest,
  workerId: number
): Promise<Partial<GbpProfileSnapshot> | null> {
  const send = () =>
    safeRuntimeSendMessage<{
      ok?: boolean;
      snapshot?: Partial<GbpProfileSnapshot> | null;
    }>({
      type: 'PARALLEL_DEEP_SCAN_AUDIT_PLACE',
      request,
      workerId, // Tell service worker which worker's tab to use
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(900);

    try {
      const res = await send();
      const snapshot = res?.snapshot ?? null;
      if (snapshot?.hours?.trim()) {
        return snapshot;
      }
      if (snapshot) {
        return snapshot;
      }
    } catch (error) {
      console.warn(`[Parallel Worker ${workerId}] Scrape attempt ${attempt + 1} failed:`, error);
    }
  }

  return null;
}

/**
 * Initialize the audit tab pool in service worker
 */
export async function initializeAuditTabPool(workerCount: number): Promise<void> {
  await safeRuntimeSendMessage({
    type: 'PARALLEL_DEEP_SCAN_INIT',
    workerCount,
  });
}

/**
 * Clean up all audit tabs in service worker
 */
export async function cleanupAuditTabPool(): Promise<void> {
  await safeRuntimeSendMessage({
    type: 'PARALLEL_DEEP_SCAN_CLEANUP',
  });
}
