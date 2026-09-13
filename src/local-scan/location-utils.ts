import type { LocalScanBusiness } from './types';

/** Heuristic: service-area businesses often lack a street address but have service areas. */
export function isServiceAreaBusiness(business: LocalScanBusiness): boolean {
  const address = business.address.trim();
  if (/service area/i.test(address)) return true;
  if (business.serviceAreas.length > 0 && !address) return true;
  if (business.serviceAreas.length > 0 && !/\d/.test(address)) return true;
  if (!address && business.lat != null && business.lng != null) return true;
  return false;
}

export function businessesWithCoordinates(
  businesses: LocalScanBusiness[]
): Array<LocalScanBusiness & { lat: number; lng: number }> {
  return businesses.filter(
    (b): b is LocalScanBusiness & { lat: number; lng: number } =>
      b.lat != null && b.lng != null && Number.isFinite(b.lat) && Number.isFinite(b.lng)
  );
}

export function sortBusinessesByRank(businesses: LocalScanBusiness[]): LocalScanBusiness[] {
  return [...businesses].sort((a, b) => a.rank - b.rank);
}

export function businessLocationLabel(business: LocalScanBusiness): string {
  if (business.address.trim()) return business.address.trim();
  if (business.serviceAreas.length) return business.serviceAreas.join(', ');
  return isServiceAreaBusiness(business) ? 'Service area business' : 'Address unavailable';
}
