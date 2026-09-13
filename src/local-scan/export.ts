import type { LocalScanSession } from './types';
import { miscFieldsForBusiness } from './misc-fields';

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function sessionToCsvRows(session: LocalScanSession): string[][] {
  const headers = [
    'Rank',
    'Name',
    'Primary Category',
    'Secondary Categories',
    'Rating',
    'Reviews',
    'Negative Reviews',
    'Address',
    'Phone',
    'Website',
    'Has Website',
    'Hours',
    'Special Hours',
    'Booking Link',
    'Services',
    'Attributes',
    'GBP Score',
    'Business Status',
    'Claimed',
    'Has Photos',
    'Photo Count',
    'Latest Photo',
    'Has Posts',
    'Post Count',
    'Latest Post',
    'Lat',
    'Lng',
    'Distance Km',
    'Plus Code',
    'Place ID',
    'ChIJ',
    'CID',
    'Hex FID',
    'Knowledge Graph ID',
    'Business Profile ID',
    'Service Areas',
    'Maps URL',
    'Deep Scraped',
    'Scrape Error',
  ];

  const rows: string[][] = session.businesses.map((b) => [
    String(b.rank),
    b.name,
    b.primaryCategory,
    b.secondaryCategories.join('; '),
    b.rating != null ? String(b.rating) : '',
    b.reviewCount != null ? String(b.reviewCount) : '',
    b.negativeReviewCount != null ? String(b.negativeReviewCount) : '',
    b.address,
    b.phone,
    b.website,
    b.hasWebsite ? 'Yes' : 'No',
    b.hours,
    b.specialHours,
    b.bookingLink,
    b.services.join('; '),
    b.attributes.join('; '),
    b.gbpScore != null ? String(b.gbpScore) : '',
    b.businessStatus,
    b.claimed === true ? 'Yes' : b.claimed === false ? 'No' : '',
    b.hasPhotos === true ? 'Yes' : b.hasPhotos === false ? 'No' : '',
    b.photoCount != null ? String(b.photoCount) : '',
    b.latestPhotoDate,
    b.hasPosts === true ? 'Yes' : b.hasPosts === false ? 'No' : '',
    b.postCount != null ? String(b.postCount) : '',
    b.latestPostDate,
    b.lat != null ? String(b.lat) : '',
    b.lng != null ? String(b.lng) : '',
    b.distanceKm != null ? String(b.distanceKm) : '',
    b.plusCode,
    b.placeId,
    b.placeIdChij,
    b.cid != null ? String(b.cid) : '',
    b.hexFid,
    b.knowledgeGraphId,
    b.businessProfileId ?? '',
    b.serviceAreas.join('; '),
    b.mapsUrl,
    b.deepScraped ? 'Yes' : 'No',
    b.scrapeError ?? '',
  ]);

  return [headers, ...rows];
}

export function sessionToCsv(session: LocalScanSession): string {
  return sessionToCsvRows(session)
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
}

export function sessionToJson(session: LocalScanSession): string {
  return JSON.stringify(session, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadLocalScanCsv(session: LocalScanSession): void {
  const safeKeyword = session.context.keyword.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  downloadTextFile(`local-scan-${safeKeyword}-${session.id.slice(0, 8)}.csv`, sessionToCsv(session), 'text/csv');
}

export function downloadLocalScanJson(session: LocalScanSession): void {
  const safeKeyword = session.context.keyword.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  downloadTextFile(
    `local-scan-${safeKeyword}-${session.id.slice(0, 8)}.json`,
    sessionToJson(session),
    'application/json'
  );
}

export function miscMatrixCsv(session: LocalScanSession): string {
  const fieldRows = session.businesses.map((b) => miscFieldsForBusiness(b));
  const headers = ['Field', ...session.businesses.map((b) => `#${b.rank} ${b.name}`)];
  const maxFields = Math.max(...fieldRows.map((r) => r.length), 0);
  const rows: string[][] = [headers];

  for (let i = 0; i < maxFields; i++) {
    const label = fieldRows[0]?.[i]?.label ?? fieldRows.find((r) => r[i])?.[i]?.label ?? '';
    rows.push([label, ...fieldRows.map((r) => r[i]?.value ?? '—')]);
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}
