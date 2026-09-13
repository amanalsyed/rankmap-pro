/**
 * PARALLEL DEEP SCAN IMPLEMENTATION
 * 
 * This is the new parallel worker approach that processes multiple businesses simultaneously.
 * Uses a pool of 3 audit tabs (ONE PER WORKER) to speed up deep scanning by ~2-3x.
 * 
 * The original sequential implementation is preserved in local-scan-deep.ts
 * 
 * Architecture:
 * - 3 Workers running in parallel
 * - Each worker has its OWN dedicated audit tab (no sharing!)
 * - Businesses are distributed round-robin across workers
 * - Progress tracking is centralized
 * - Same scraping accuracy as sequential (just parallelized execution)
 */

import type { LocalScanBusiness } from '../local-scan/types';
import { mergeSnapshotIntoBusiness } from '../local-scan/merge-snapshot';
import { sleep } from './dom-utils';
import {
  scrapePlaceForWorker,
  initializeAuditTabPool,
  cleanupAuditTabPool,
} from './parallel-deep-scan-client'; // Use client-side messaging
import { normalizeBusinessLead } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WORKER_COUNT = 3;
const WORKER_DELAY_MS = 150; // Stagger worker starts to avoid conflicts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerTask {
  business: LocalScanBusiness;
  card: HTMLElement;
  index: number;
}

interface WorkerResult {
  business: LocalScanBusiness;
  index: number;
}

interface WorkerState {
  id: number;
  processing: boolean;
  tasksCompleted: number;
}

// ---------------------------------------------------------------------------
// Worker Pool Manager
// ---------------------------------------------------------------------------

class DeepScanWorkerPool {
  private workers: WorkerState[] = [];
  private tasks: WorkerTask[] = [];
  private results: WorkerResult[] = [];
  private totalTasks: number = 0; // Store fixed total for accurate progress
  private stopRequested = false;
  private onProgress?: (current: number, total: number, businessName: string) => void;
  private center: { lat: number | null; lng: number | null };

  constructor(
    businesses: LocalScanBusiness[],
    _cards: HTMLElement[], // Not used in parallel mode (each worker manages its own audit tab)
    center: { lat: number | null; lng: number | null },
    onProgress?: (current: number, total: number, businessName: string) => void
  ) {
    this.center = center;
    this.onProgress = onProgress;
    
    // Create task queue (no need for cards, workers use audit tabs)
    this.tasks = businesses.map((business, index) => ({
      business,
      card: null as any, // Not used in parallel mode
      index,
    }));

    // Store total count for accurate progress reporting
    this.totalTasks = this.tasks.length;

    // Initialize workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      this.workers.push({
        id: i + 1,
        processing: false,
        tasksCompleted: 0,
      });
    }
  }

  async run(): Promise<LocalScanBusiness[]> {
    // Start all workers in parallel (with slight delay to stagger)
    const workerPromises = this.workers.map((worker, index) => 
      this.runWorker(worker, index * WORKER_DELAY_MS)
    );

    // Wait for all workers to complete
    await Promise.all(workerPromises);

    // Sort results by original index to maintain order
    this.results.sort((a, b) => a.index - b.index);
    
    return this.results.map(r => r.business);
  }

  private async runWorker(worker: WorkerState, initialDelay: number): Promise<void> {
    // Stagger worker starts
    if (initialDelay > 0) {
      await sleep(initialDelay);
    }

    while (true) {
      if (this.stopRequested) {
        break;
      }

      // Get next task
      const task = this.tasks.shift();
      if (!task) {
        break; // No more tasks
      }

      worker.processing = true;

      try {
        // Create lead for merging (same as stubLeadFromRequest)
        const lead = normalizeBusinessLead({
          id: task.business.placeId,
          name: task.business.name,
          mapsUrl: task.business.mapsUrl,
          category: task.business.primaryCategory || '',
          address: task.business.address || '',
          phone: task.business.phone || '',
          rating: task.business.rating?.toString() || '',
          reviews: task.business.reviewCount?.toString() || '',
          mapsRank: task.business.rank,
          hasWebsite: false, // BusinessLead always has hasWebsite: false
        });

        // Scrape using this worker's dedicated audit tab
        // Each worker (1, 2, 3) has its own tab, so they can run truly in parallel
        const snapshot = await scrapePlaceForWorker(
          {
            name: task.business.name,
            address: task.business.address || '',
            phone: task.business.phone || '',
            mapsUrl: task.business.mapsUrl,
            placeId: task.business.placeId,
          },
          worker.id // Use worker's dedicated tab
        );

        // Merge scraped snapshot into business (same logic as sequential)
        const scraped = snapshot
          ? mergeSnapshotIntoBusiness(task.business, snapshot, lead, this.center)
          : { ...task.business, deepScraped: false, scrapeError: 'No snapshot returned' };

        // Store result
        this.results.push({
          business: scraped,
          index: task.index,
        });

        worker.tasksCompleted++;

        // Report progress (use fixed total, not dynamic calculation)
        if (this.onProgress) {
          this.onProgress(
            this.results.length,
            this.totalTasks,
            scraped.name
          );
        }

        // Small delay between tasks
        await sleep(300);
      } catch (error) {
        // On error, store failed business
        this.results.push({
          business: {
            ...task.business,
            deepScraped: false,
            scrapeError: error instanceof Error ? error.message : 'Worker scrape failed',
          },
          index: task.index,
        });
      }

      worker.processing = false;
    }
  }

  stop(): void {
    this.stopRequested = true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run deep scan with parallel workers (3 tabs processing simultaneously)
 * 
 * This is ~2-3x faster than sequential but uses more browser resources.
 * Falls back to sequential processing if any issues occur.
 */
export async function runParallelDeepScan(
  businesses: LocalScanBusiness[],
  cards: HTMLElement[],
  center: { lat: number | null; lng: number | null },
  maxDeepScans: number,
  onProgress?: (current: number, total: number, businessName: string) => void,
  onStop?: () => boolean
): Promise<LocalScanBusiness[]> {
  const total = businesses.length;
  const deepLimit = Math.min(maxDeepScans, total);
  
  // Separate businesses to scan vs skip
  const toScan = businesses.slice(0, deepLimit);
  const toSkip = businesses.slice(deepLimit);

  try {
    // Initialize audit tab pool (3 tabs, one per worker)
    await initializeAuditTabPool(WORKER_COUNT);

    // Create worker pool
    const pool = new DeepScanWorkerPool(toScan, cards, center, onProgress);

    // Check for stop request during execution
    const checkStop = setInterval(() => {
      if (onStop && onStop()) {
        pool.stop();
        clearInterval(checkStop);
      }
    }, 500);

    // Run parallel scan (workers use their dedicated tabs!)
    const scanned = await pool.run();

    clearInterval(checkStop);

    // Cleanup audit tabs
    await cleanupAuditTabPool();

    // Add skipped businesses
    const skipped = toSkip.map(business => ({
      ...business,
      deepScraped: false,
      scrapeError: 'Skipped — monthly deep scan limit reached.',
    }));

    return [...scanned, ...skipped];
  } catch (error) {
    console.error('[Parallel Deep Scan] Error:', error);
    
    // Cleanup tabs on error too
    try {
      await cleanupAuditTabPool();
    } catch {
      // Ignore cleanup errors
    }
    
    // On catastrophic failure, return businesses with error
    return businesses.map(business => ({
      ...business,
      deepScraped: false,
      scrapeError: 'Parallel scan failed. Please try again.',
    }));
  }
}
