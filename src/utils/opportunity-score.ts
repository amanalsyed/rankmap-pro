import type { BusinessLead } from '../types';
import { bestEmailConfidence } from '../enrichment/email-validation';

export type OpportunityTier = 'hot' | 'warm' | 'cool';

export type LeadSortKey = 'opportunity' | 'mapsRank' | 'gbpScore' | 'reviews' | 'name';

export interface LeadFilters {
  hasEmail: boolean;
  hasOwner: boolean;
  top10Rank: boolean;
  /** Show leads with no GBP audit or audit score strictly below this (1–100). */
  maxGbpScore: number | null;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  hasEmail: false,
  hasOwner: false,
  top10Rank: false,
  maxGbpScore: null,
};

export interface OpportunityBreakdown {
  total: number;
  tier: OpportunityTier;
  rankPoints: number;
  gbpGapPoints: number;
  contactPoints: number;
  reputationPoints: number;
  summary: string;
}

function parseReviewCount(reviews: string): number {
  const n = parseInt(String(reviews).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseRating(rating: string): number {
  const n = parseFloat(String(rating).replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function rankVisibilityPoints(rank: number | null): number {
  if (rank == null || rank <= 0) return 12;
  if (rank <= 3) return 30;
  if (rank <= 10) return 25;
  if (rank <= 20) return 18;
  return 10;
}

function gbpGapPoints(lead: BusinessLead): number {
  const score = lead.gbpAudit?.score;
  if (score == null || lead.gbpAudit?.status !== 'done') return 8;
  return Math.round((100 - score) * 0.25);
}

function contactPoints(lead: BusinessLead): number {
  let pts = 0;
  const emails = lead.emails ?? [];
  if (emails.length > 0) {
    const best = bestEmailConfidence(emails);
    if (best === 'verified') pts += 14;
    else if (best === 'likely') pts += 12;
    else pts += 8;
  }
  if (lead.phone) pts += 8;
  if (lead.ownerName) pts += 10;
  if (
    lead.facebook ||
    lead.instagram ||
    lead.linkedin ||
    lead.twitter ||
    lead.tiktok ||
    lead.yelp ||
    lead.yellowpages ||
    lead.bbb ||
    lead.angi ||
    lead.thumbtack ||
    lead.manta ||
    lead.foursquare ||
    lead.mapquest
  ) {
    pts += 5;
  }
  return pts;
}

function reputationPoints(lead: BusinessLead): number {
  const reviews = parseReviewCount(lead.reviews);
  let pts = 0;
  if (reviews >= 50) pts += 10;
  else if (reviews >= 20) pts += 7;
  else if (reviews >= 5) pts += 4;
  else pts += 2;

  if (parseRating(lead.rating) >= 4) pts += 5;
  return pts;
}

function tierFromScore(total: number): OpportunityTier {
  if (total >= 75) return 'hot';
  if (total >= 55) return 'warm';
  return 'cool';
}

function buildSummary(lead: BusinessLead, tier: OpportunityTier): string {
  const parts: string[] = ['No website on GBP'];
  if (lead.mapsRank != null && lead.mapsRank > 0) {
    parts.push(`rank #${lead.mapsRank}`);
  }
  if (lead.gbpAudit?.status === 'done' && lead.gbpAudit.score != null) {
    parts.push(`GBP ${lead.gbpAudit.score}/100`);
  }
  if (lead.emails?.length) {
    const best = bestEmailConfidence(lead.emails);
    parts.push(best === 'verified' ? 'verified email' : best === 'likely' ? 'likely email' : 'email found');
  }
  if (lead.ownerName) parts.push('owner identified');
  return `${tier.charAt(0).toUpperCase() + tier.slice(1)} prospect — ${parts.join(', ')}.`;
}

export function computeOpportunityScore(lead: BusinessLead): OpportunityBreakdown {
  const rankPts = rankVisibilityPoints(lead.mapsRank);
  const gbpPts = gbpGapPoints(lead);
  const contactPts = contactPoints(lead);
  const repPts = reputationPoints(lead);
  const total = Math.min(100, rankPts + gbpPts + contactPts + repPts);
  const tier = tierFromScore(total);

  return {
    total,
    tier,
    rankPoints: rankPts,
    gbpGapPoints: gbpPts,
    contactPoints: contactPts,
    reputationPoints: repPts,
    summary: buildSummary(lead, tier),
  };
}

export function formatOpportunityTier(tier: OpportunityTier): string {
  if (tier === 'hot') return 'Hot';
  if (tier === 'warm') return 'Warm';
  return 'Cool';
}

export function filterLeads(leads: BusinessLead[], filters: LeadFilters): BusinessLead[] {
  return leads.filter((lead) => {
    if (filters.hasEmail && (lead.emails?.length ?? 0) === 0) return false;
    if (filters.hasOwner && !lead.ownerName) return false;
    if (filters.top10Rank && (lead.mapsRank == null || lead.mapsRank > 10)) return false;
    if (filters.maxGbpScore != null) {
      const score = lead.gbpAudit?.score;
      if (score != null && lead.gbpAudit?.status === 'done' && score >= filters.maxGbpScore) {
        return false;
      }
    }
    return true;
  });
}

function compareMapsRank(a: BusinessLead, b: BusinessLead): number {
  const rankA = a.mapsRank ?? 9999;
  const rankB = b.mapsRank ?? 9999;
  return rankA - rankB;
}

function compareGbpScoreAsc(a: BusinessLead, b: BusinessLead): number {
  const scoreA = a.gbpAudit?.status === 'done' && a.gbpAudit.score != null ? a.gbpAudit.score : 101;
  const scoreB = b.gbpAudit?.status === 'done' && b.gbpAudit.score != null ? b.gbpAudit.score : 101;
  return scoreA - scoreB;
}

export function sortLeads(leads: BusinessLead[], sortKey: LeadSortKey): BusinessLead[] {
  const copy = [...leads];
  switch (sortKey) {
    case 'mapsRank':
      copy.sort(compareMapsRank);
      break;
    case 'gbpScore':
      copy.sort(compareGbpScoreAsc);
      break;
    case 'reviews':
      copy.sort((a, b) => parseReviewCount(b.reviews) - parseReviewCount(a.reviews));
      break;
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'opportunity':
    default:
      copy.sort(
        (a, b) => computeOpportunityScore(b).total - computeOpportunityScore(a).total
      );
      break;
  }
  return copy;
}

export function processLeads(
  leads: BusinessLead[],
  filters: LeadFilters,
  sortKey: LeadSortKey
): BusinessLead[] {
  return sortLeads(filterLeads(leads, filters), sortKey);
}

export function activeFilterCount(filters: LeadFilters): number {
  let count = 0;
  if (filters.hasEmail) count++;
  if (filters.hasOwner) count++;
  if (filters.top10Rank) count++;
  if (filters.maxGbpScore != null) count++;
  return count;
}
