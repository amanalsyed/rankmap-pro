import type { ScanParams } from '../types';

/** e.g. "Miami plumbers – Mar 2026" */
export function generateSessionName(params: ScanParams, at = new Date()): string {
  const locationLabel = params.location.split(',')[0]?.trim() || params.location.trim();
  const nicheLabel = params.niche.trim().toLowerCase();
  const month = at.toLocaleString('en-US', { month: 'short' });
  const year = at.getFullYear();
  return `${locationLabel} ${nicheLabel} – ${month} ${year}`;
}

/** e.g. "Plumbers – 4 cities – Mar 2026" */
export function generateBatchSessionName(niche: string, cityCount: number, at = new Date()): string {
  const nicheLabel = niche.trim().toLowerCase();
  const month = at.toLocaleString('en-US', { month: 'short' });
  const year = at.getFullYear();
  return `${nicheLabel} – ${cityCount} cities – ${month} ${year}`;
}

export function formatSessionDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
