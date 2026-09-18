import type { ScanProgress } from '../types';

export interface ScanSummaryStats {
  target: number;
  checked: number;
  leads: number;
  skipped: number;
  notScanned: number;
}

export function computeScanSummaryStats(
  progress: Pick<ScanProgress, 'checked' | 'withoutWebsite' | 'target'>,
  resultsCount?: number
): ScanSummaryStats {
  const checked = Math.max(0, progress.checked ?? 0);
  const target = Math.max(0, progress.target ?? 0);
  const leads = Math.max(0, resultsCount ?? progress.withoutWebsite ?? 0);
  const skipped = Math.max(0, checked - leads);
  const notScanned = Math.max(0, target - checked);
  return { target, checked, leads, skipped, notScanned };
}

function statsParts(stats: ScanSummaryStats): string[] {
  const parts = [
    `Checked ${stats.checked}/${stats.target}`,
    `${stats.leads} lead${stats.leads === 1 ? '' : 's'} (no website)`,
    `${stats.skipped} skipped (had website)`,
  ];
  if (stats.notScanned > 0) {
    parts.push(`${stats.notScanned} not scanned`);
  }
  return parts;
}

export function formatScanListingCompleteMessage(
  stats: ScanSummaryStats,
  enrichingCount: number,
  options: { stopped?: boolean; batchCity?: string } = {}
): string {
  const prefix = options.stopped ? 'Scan stopped' : 'Listing scan finished';
  const city = options.batchCity ? ` — ${options.batchCity}` : '';
  const summary = statsParts(stats).join(' · ');
  return `${prefix}${city} — ${summary}. Enriching ${enrichingCount} lead${enrichingCount === 1 ? '' : 's'}…`;
}

export function formatScanFullyCompleteMessage(
  stats: ScanSummaryStats,
  options: {
    stopped?: boolean;
    batchFinished?: boolean;
    batchCities?: number;
    totalLeads?: number;
  } = {}
): string {
  if (options.batchFinished && options.batchCities && options.batchCities > 1) {
    const total = options.totalLeads ?? stats.leads;
    const citySummary = statsParts(stats).join(' · ');
    return `Batch complete — ${options.batchCities} cities · ${total} total lead${total === 1 ? '' : 's'}. Last city: ${citySummary}.`;
  }

  const prefix = options.stopped ? 'Scan stopped' : 'Scan finished';
  return `${prefix} — ${statsParts(stats).join(' · ')}.`;
}
