import { buildGbpAudit, mergeLeadIntoSnapshot } from '../audit/scoring';
import type { GbpProfileSnapshot } from '../audit/types';
import type { BusinessLead } from '../types';
import { pickBestCategories } from '../content/listing-categories';
import { pickBestCoordinates } from '../content/listing-coordinates';
import { computeDistanceKm, parseRatingValue, parseReviewCount } from './aggregate';
import { emptyLocalScanBusiness, type LocalScanBusiness } from './types';

export function mergeSnapshotIntoBusiness(
  business: LocalScanBusiness,
  snapshot: Partial<GbpProfileSnapshot>,
  lead: BusinessLead,
  center: { lat: number | null; lng: number | null }
): LocalScanBusiness {
  const bestCoords = pickBestCoordinates(
    [
      { lat: snapshot.lat ?? null, lng: snapshot.lng ?? null },
      { lat: business.lat, lng: business.lng },
    ],
    [snapshot.mapsUrl, business.mapsUrl]
  );
  const lat = bestCoords.lat;
  const lng = bestCoords.lng;

  let gbpScore: number | null = business.gbpScore;
  try {
    const merged = mergeLeadIntoSnapshot(lead, {
      ...snapshot,
      hasWebsite: snapshot.hasWebsite ?? business.hasWebsite,
    });
    const audit = buildGbpAudit(merged, lead);
    if (audit.status === 'done' && typeof audit.score === 'number') {
      gbpScore = audit.score;
    }
  } catch {
    // keep prior score
  }

  const bestCategories = pickBestCategories([
    snapshot.primaryCategory
      ? { primary: snapshot.primaryCategory, secondary: snapshot.secondaryCategories ?? [] }
      : null,
    business.primaryCategory
      ? { primary: business.primaryCategory, secondary: business.secondaryCategories ?? [] }
      : null,
  ]);

  return {
    ...business,
    name: snapshot.name || business.name,
    address: snapshot.address || business.address,
    phone: snapshot.phone || business.phone,
    website: snapshot.website || business.website,
    primaryCategory: bestCategories?.primary ?? '',
    secondaryCategories: bestCategories?.secondary ?? [],
    rating: snapshot.rating ?? business.rating ?? parseRatingValue(lead.rating),
    reviewCount:
      snapshot.reviewCount ??
      business.reviewCount ??
      parseReviewCount(lead.reviews),
    negativeReviewCount: snapshot.negativeReviewCount ?? business.negativeReviewCount,
    hasWebsite: snapshot.hasWebsite ?? business.hasWebsite,
    lat,
    lng,
    distanceKm: computeDistanceKm({ lat, lng }, center.lat, center.lng),
    services: snapshot.services?.length ? snapshot.services : business.services,
    attributes: snapshot.attributes?.length ? snapshot.attributes : business.attributes,
    hours: snapshot.hours?.trim() || business.hours,
    specialHours: snapshot.specialHours?.trim() || business.specialHours,
    bookingLink: snapshot.bookingLink || business.bookingLink,
    gbpScore,
    claimed: snapshot.claimed ?? business.claimed,
    businessStatus: snapshot.businessStatus || business.businessStatus,
    hasPhotos: snapshot.hasPhotos ?? business.hasPhotos,
    hasPosts: snapshot.hasPosts ?? business.hasPosts,
    photoCount: snapshot.photoCount ?? business.photoCount,
    postCount: snapshot.postCount ?? business.postCount,
    latestPhotoDate: snapshot.latestPhotoDate || business.latestPhotoDate,
    latestPostDate: snapshot.latestPostDate || business.latestPostDate,
    plusCode: snapshot.plusCode || business.plusCode,
    placeIdChij:
      (snapshot.placeId?.startsWith('ChIJ') ? snapshot.placeId : null) ||
      business.placeIdChij ||
      (business.placeId.startsWith('ChIJ') ? business.placeId : ''),
    cid: snapshot.cid ?? business.cid,
    hexFid: snapshot.hexFid || business.hexFid,
    knowledgeGraphId: snapshot.knowledgeGraphId || business.knowledgeGraphId,
    businessProfileId: snapshot.businessProfileId ?? business.businessProfileId,
    serviceAreas: snapshot.serviceAreas?.length ? snapshot.serviceAreas : business.serviceAreas,
    deepScraped: true,
    scrapeError: undefined,
  };
}

export function businessScrapeFailed(
  business: LocalScanBusiness,
  message: string
): LocalScanBusiness {
  return {
    ...business,
    deepScraped: false,
    scrapeError: message,
  };
}

export function quickScanDefaults(
  partial: Pick<LocalScanBusiness, 'placeId' | 'rank' | 'name' | 'mapsUrl'> &
    Partial<LocalScanBusiness>
): LocalScanBusiness {
  return emptyLocalScanBusiness(partial);
}
