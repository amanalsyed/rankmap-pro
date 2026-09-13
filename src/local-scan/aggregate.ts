import type { LocalScanBusiness } from './types';

export interface CategoryFrequency {
  name: string;
  count: number;
  share: number;
}

export interface ReviewStats {
  avgRating: number | null;
  avgReviews: number | null;
  maxReviews: number | null;
  minReviews: number | null;
  totalBusinesses: number;
}

export function parseRatingValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseReviewCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '').match(/(\d+)/);
  if (!cleaned) return null;
  const n = parseInt(cleaned[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeDistanceKm(
  business: Pick<LocalScanBusiness, 'lat' | 'lng'>,
  centerLat: number | null,
  centerLng: number | null
): number | null {
  if (
    centerLat == null ||
    centerLng == null ||
    business.lat == null ||
    business.lng == null
  ) {
    return null;
  }
  return Math.round(haversineKm(centerLat, centerLng, business.lat, business.lng) * 100) / 100;
}

export function aggregateCategoryFrequency(businesses: LocalScanBusiness[]): CategoryFrequency[] {
  const counts = new Map<string, number>();
  const total = businesses.length || 1;

  for (const business of businesses) {
    const categories = [
      business.primaryCategory,
      ...business.secondaryCategories,
    ].filter(Boolean);

    const seen = new Set<string>();
    for (const cat of categories) {
      const key = cat.trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function aggregatePrimaryCategoryFrequency(
  businesses: LocalScanBusiness[]
): CategoryFrequency[] {
  const counts = new Map<string, number>();
  const total = businesses.length || 1;

  for (const business of businesses) {
    const key = business.primaryCategory.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function aggregateReviewStats(businesses: LocalScanBusiness[]): ReviewStats {
  const ratings = businesses.map((b) => b.rating).filter((v): v is number => v != null);
  const reviews = businesses.map((b) => b.reviewCount).filter((v): v is number => v != null);

  const avg = (values: number[]) =>
    values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

  return {
    avgRating: avg(ratings),
    avgReviews: avg(reviews),
    maxReviews: reviews.length ? Math.max(...reviews) : null,
    minReviews: reviews.length ? Math.min(...reviews) : null,
    totalBusinesses: businesses.length,
  };
}

export function formatDistanceKm(km: number | null): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export interface StringFrequency {
  name: string;
  count: number;
  share: number;
}

export function aggregateStringFrequency(
  businesses: LocalScanBusiness[],
  pick: (business: LocalScanBusiness) => string[]
): StringFrequency[] {
  const counts = new Map<string, number>();
  const total = businesses.length || 1;

  for (const business of businesses) {
    const seen = new Set<string>();
    for (const value of pick(business)) {
      const key = value.trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function aggregateServiceFrequency(businesses: LocalScanBusiness[]): StringFrequency[] {
  return aggregateStringFrequency(businesses, (b) => b.services ?? []);
}

export function aggregateAttributeFrequency(businesses: LocalScanBusiness[]): StringFrequency[] {
  return aggregateStringFrequency(businesses, (b) => b.attributes ?? []);
}

export interface HoursStats {
  withHours: number;
  open24Count: number;
  temporarilyClosedCount: number;
}

export function aggregateHoursStats(businesses: LocalScanBusiness[]): HoursStats {
  let withHours = 0;
  let open24Count = 0;
  let temporarilyClosedCount = 0;

  for (const business of businesses) {
    const hours = (business.hours ?? '').trim();
    if (!hours) continue;
    withHours++;
    if (/open 24\s*hours?|24\s*hours?|24\/7|24 hrs?/i.test(hours)) open24Count++;
    if (/temporarily closed|permanently closed/i.test(hours)) temporarilyClosedCount++;
  }

  return { withHours, open24Count, temporarilyClosedCount };
}

export function copyTextList(values: string[]): string {
  return values.filter(Boolean).join('\n');
}
