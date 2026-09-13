import type { BusinessLead } from '../types';
import { formatMapsRank } from '../types';
import { sanitizePlaceId } from '../content/maps-id-utils';
import { buildAuditLinkGroups } from './links';
import type { AuditFinding, GbpAudit, GbpProfileSnapshot } from './types';
import { emptyGbpAudit, emptySnapshot } from './types';

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (!value) return null;
  const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function finding(
  id: string,
  label: string,
  status: AuditFinding['status'],
  message: string
): AuditFinding {
  return { id, label, status, message };
}

interface ScoreRule {
  id: string;
  label: string;
  maxPoints: number;
  evaluate: () => { points: number; status: AuditFinding['status']; message: string };
}

export function buildGbpAudit(snapshot: GbpProfileSnapshot, lead: BusinessLead): GbpAudit {
  const rules: ScoreRule[] = [
    {
      id: 'website',
      label: 'Website',
      maxPoints: 15,
      evaluate: () => {
        if (!snapshot.hasWebsite) {
          return {
            points: 0,
            status: 'critical',
            message:
              'No website listed on Google Business Profile — strong website and SEO prospect.',
          };
        }
        return { points: 15, status: 'good', message: 'Website is listed on GBP.' };
      },
    },
    {
      id: 'maps-rank',
      label: 'Maps Visibility',
      maxPoints: 10,
      evaluate: () => {
        const rank = lead.mapsRank;
        if (!rank) {
          return {
            points: 5,
            status: 'needs_improvement',
            message: 'Maps ranking position could not be determined.',
          };
        }
        if (rank <= 10 && !snapshot.hasWebsite) {
          return {
            points: 3,
            status: 'critical',
            message: `${formatMapsRank(rank)} with no website — high visibility, weak conversion path.`,
          };
        }
        if (rank <= 20) {
          return {
            points: 8,
            status: 'needs_improvement',
            message: `${formatMapsRank(rank)} — visible in local results.`,
          };
        }
        return { points: 10, status: 'good', message: `${formatMapsRank(rank)} in search results.` };
      },
    },
    {
      id: 'primary-category',
      label: 'Primary Category',
      maxPoints: 10,
      evaluate: () => {
        const cat = snapshot.primaryCategory || lead.category;
        if (!cat) return { points: 0, status: 'critical', message: 'Primary category is missing.' };
        return { points: 10, status: 'good', message: `Primary category: ${cat}` };
      },
    },
    {
      id: 'secondary-categories',
      label: 'Secondary Categories',
      maxPoints: 8,
      evaluate: () => {
        const count = snapshot.secondaryCategories.length;
        if (count === 0) {
          return { points: 2, status: 'critical', message: 'No secondary categories found.' };
        }
        if (count === 1) {
          return {
            points: 5,
            status: 'needs_improvement',
            message: 'Only one secondary category — add more relevant categories.',
          };
        }
        return { points: 8, status: 'good', message: `${count} secondary categories configured.` };
      },
    },
    {
      id: 'hours',
      label: 'Business Hours',
      maxPoints: 8,
      evaluate: () => {
        if (!snapshot.hours) {
          return { points: 0, status: 'critical', message: 'Business hours are not listed.' };
        }
        return { points: 8, status: 'good', message: 'Business hours are configured.' };
      },
    },
    {
      id: 'phone',
      label: 'Phone Number',
      maxPoints: 7,
      evaluate: () => {
        const phone = snapshot.phone || lead.phone;
        if (!phone) {
          return { points: 0, status: 'critical', message: 'Phone number is missing from profile.' };
        }
        return { points: 7, status: 'good', message: `Phone: ${phone}` };
      },
    },
    {
      id: 'address',
      label: 'Business Address',
      maxPoints: 7,
      evaluate: () => {
        const addr = snapshot.address || lead.address;
        if (!addr) {
          return { points: 0, status: 'critical', message: 'Business address is missing.' };
        }
        return { points: 7, status: 'good', message: 'Business address is listed.' };
      },
    },
    {
      id: 'photos',
      label: 'Photos',
      maxPoints: 10,
      evaluate: () => {
        if (snapshot.hasPhotos === false) {
          return { points: 2, status: 'critical', message: 'No photos found on the Google Business Profile.' };
        }
        if (snapshot.hasPhotos === true) {
          const dateNote = snapshot.latestPhotoDate ? ` Latest photo: ${snapshot.latestPhotoDate}.` : '';
          return { points: 10, status: 'good', message: `Photos are present on the profile.${dateNote}` };
        }
        return {
          points: 6,
          status: 'needs_improvement',
          message: 'Photos could not be verified from GBP.',
        };
      },
    },
    {
      id: 'posts',
      label: 'Google Posts',
      maxPoints: 8,
      evaluate: () => {
        if (snapshot.hasPosts === false) {
          return {
            points: 2,
            status: 'critical',
            message: 'No Google Posts found — profile appears inactive.',
          };
        }
        if (snapshot.hasPosts === true) {
          const dateNote = snapshot.latestPostDate ? ` Latest post: ${snapshot.latestPostDate}.` : '';
          return { points: 8, status: 'good', message: `Google Posts are present.${dateNote}` };
        }
        return {
          points: 4,
          status: 'needs_improvement',
          message: 'Google Posts activity could not be verified.',
        };
      },
    },
    {
      id: 'reviews',
      label: 'Reviews',
      maxPoints: 10,
      evaluate: () => {
        const count = snapshot.reviewCount ?? parseNumber(lead.reviews);
        const rating = snapshot.rating ?? parseNumber(lead.rating);
        if (count === null || count === 0) {
          return { points: 2, status: 'critical', message: 'Very few or no reviews found.' };
        }
        if (count < 20) {
          return {
            points: 5,
            status: 'needs_improvement',
            message: `${count} reviews — build more social proof.`,
          };
        }
        const ratingText = rating ? ` at ${rating}★` : '';
        return { points: 10, status: 'good', message: `${count} reviews${ratingText}.` };
      },
    },
    {
      id: 'attributes',
      label: 'Attributes',
      maxPoints: 7,
      evaluate: () => {
        const count = snapshot.attributes.length;
        if (count === 0) {
          return {
            points: 2,
            status: 'needs_improvement',
            message: 'No business attributes found — add amenities and service options.',
          };
        }
        return { points: 7, status: 'good', message: `${count} attributes listed.` };
      },
    },
  ];

  let earned = 0;
  let max = 0;
  const critical: AuditFinding[] = [];
  const needsImprovement: AuditFinding[] = [];
  const good: AuditFinding[] = [];

  for (const rule of rules) {
    max += rule.maxPoints;
    const result = rule.evaluate();
    earned += result.points;
    const item = finding(rule.id, rule.label, result.status, result.message);
    if (result.status === 'critical') critical.push(item);
    else if (result.status === 'needs_improvement') needsImprovement.push(item);
    else good.push(item);
  }

  const score = max > 0 ? Math.round((earned / max) * 100) : null;

  return {
    status: 'done',
    auditedAt: new Date().toISOString(),
    score,
    snapshot,
    critical,
    needsImprovement,
    good,
    linkGroups: buildAuditLinkGroups(snapshot, lead),
  };
}

export function mergeLeadIntoSnapshot(
  lead: BusinessLead,
  scraped: Partial<GbpProfileSnapshot>
): GbpProfileSnapshot {
  const base = emptySnapshot();
  return {
    ...base,
    ...scraped,
    name: scraped.name || lead.name || base.name,
    address: scraped.address || lead.address || base.address,
    phone: scraped.phone || lead.phone || base.phone,
    mapsUrl: scraped.mapsUrl || lead.mapsUrl || base.mapsUrl,
    placeId:
      sanitizePlaceId(scraped.placeId) ??
      sanitizePlaceId(lead.id) ??
      (scraped.placeId && scraped.placeId.startsWith('ChIJ') ? scraped.placeId : base.placeId),
    primaryCategory: scraped.primaryCategory || lead.category || base.primaryCategory,
    reviewCount: scraped.reviewCount ?? parseNumber(lead.reviews),
    rating: scraped.rating ?? parseNumber(lead.rating),
    hasWebsite: scraped.hasWebsite ?? false,
  };
}

export function auditFromLeadOnly(lead: BusinessLead): GbpAudit {
  const snapshot = mergeLeadIntoSnapshot(lead, {
    hasWebsite: false,
    mapsUrl: lead.mapsUrl,
    placeId: lead.id,
  });
  return buildGbpAudit(snapshot, lead);
}

export function emptyAuditForLead(lead: BusinessLead): GbpAudit {
  return { ...emptyGbpAudit(), snapshot: mergeLeadIntoSnapshot(lead, {}) };
}
