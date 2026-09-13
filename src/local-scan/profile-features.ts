import type { LocalScanBusiness } from './types';

export interface ProfileFeatureDefinition {
  id: string;
  label: string;
  shortLabel: string;
  check: (business: LocalScanBusiness) => boolean;
}

export function hasOnlineAppointments(business: LocalScanBusiness): boolean {
  if (Boolean(business.bookingLink.trim())) return true;
  const haystack = [...business.attributes, ...business.services].join(' ').toLowerCase();
  return /online appointment|book online|online booking|schedule online|open booking link|appointments?/i.test(
    haystack
  );
}

export const PROFILE_FEATURES: ProfileFeatureDefinition[] = [
  {
    id: 'website',
    label: 'Have Websites',
    shortLabel: 'Has Website',
    check: (b) => b.hasWebsite || Boolean(b.website.trim()),
  },
  {
    id: 'phone',
    label: 'Have Phone Numbers',
    shortLabel: 'Has Phone Number',
    check: (b) => Boolean(b.phone.trim()),
  },
  {
    id: 'appointments',
    label: 'Online Appointments',
    shortLabel: 'Online Appointments',
    check: hasOnlineAppointments,
  },
  {
    id: 'address',
    label: 'Have Full Address',
    shortLabel: 'Has Full Address',
    check: (b) => Boolean(b.address.trim()) && /\d/.test(b.address),
  },
  {
    id: 'claimable',
    label: 'Allowed to Claim',
    shortLabel: 'Allowed to Claim',
    check: (b) => b.claimed === false,
  },
];

export interface ProfileFeatureBreakdown {
  score: number;
  maxScore: number;
  present: string[];
  missing: string[];
}

export function profileFeatureBreakdown(business: LocalScanBusiness): ProfileFeatureBreakdown {
  const present = PROFILE_FEATURES.filter((f) => f.check(business)).map((f) => f.shortLabel);
  const missing = PROFILE_FEATURES.filter((f) => !f.check(business)).map((f) => f.shortLabel);
  return {
    score: present.length,
    maxScore: PROFILE_FEATURES.length,
    present,
    missing,
  };
}

export interface ProfileFeatureAggregateStat {
  id: string;
  label: string;
  count: number;
  share: number;
}

export function aggregateProfileFeatureStats(
  businesses: LocalScanBusiness[]
): ProfileFeatureAggregateStat[] {
  const total = businesses.length || 1;
  return PROFILE_FEATURES.map((feature) => {
    const count = businesses.filter((b) => feature.check(b)).length;
    return {
      id: feature.id,
      label: feature.label,
      count,
      share: Math.round((count / total) * 1000) / 10,
    };
  });
}

export interface ProfileFeatureChartPoint {
  rank: number;
  name: string;
  placeId: string;
  score: number;
  maxScore: number;
  present: string[];
}

export function profileFeatureChartPoints(businesses: LocalScanBusiness[]): ProfileFeatureChartPoint[] {
  return [...businesses]
    .sort((a, b) => a.rank - b.rank)
    .map((business) => {
      const breakdown = profileFeatureBreakdown(business);
      return {
        rank: business.rank,
        name: business.name,
        placeId: business.placeId,
        score: breakdown.score,
        maxScore: breakdown.maxScore,
        present: breakdown.present,
      };
    });
}
