/**
 * DEEP SCAN CONFIGURATION
 * 
 * Feature flag to control which deep scan implementation is used.
 * 
 * Set to FALSE to use the original sequential implementation (slow but proven accurate)
 * Set to TRUE to use the new parallel worker implementation (2-3x faster)
 */

export const USE_PARALLEL_DEEP_SCAN = false; // Parallel requires major refactoring - use sequential for now // ← Easy toggle for A/B testing

/**
 * Configuration for parallel deep scan
 */
export const PARALLEL_DEEP_SCAN_CONFIG = {
  workerCount: 3,
  enabled: USE_PARALLEL_DEEP_SCAN,
};

/**
 * Get the current deep scan mode
 */
export function getDeepScanMode(): 'sequential' | 'parallel' {
  return USE_PARALLEL_DEEP_SCAN ? 'parallel' : 'sequential';
}
