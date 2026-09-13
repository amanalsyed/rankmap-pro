import type { LocalScanBusiness } from './types';

export interface MiscFieldRow {
  id: string;
  label: string;
  value: string;
}

function fmt(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function miscFieldsForBusiness(business: LocalScanBusiness): MiscFieldRow[] {
  return [
    { id: 'rank', label: 'Maps rank', value: fmt(business.rank) },
    { id: 'name', label: 'Business name', value: fmt(business.name) },
    { id: 'primaryCategory', label: 'Primary category', value: fmt(business.primaryCategory) },
    {
      id: 'secondaryCategories',
      label: 'Secondary categories',
      value: business.secondaryCategories.length ? business.secondaryCategories.join(', ') : '—',
    },
    { id: 'rating', label: 'Rating', value: fmt(business.rating) },
    { id: 'reviewCount', label: 'Review count', value: fmt(business.reviewCount) },
    { id: 'negativeReviewCount', label: 'Negative reviews', value: fmt(business.negativeReviewCount) },
    { id: 'address', label: 'Address', value: fmt(business.address) },
    { id: 'phone', label: 'Phone', value: fmt(business.phone) },
    { id: 'website', label: 'Website', value: fmt(business.website) },
    { id: 'hasWebsite', label: 'Has website', value: fmt(business.hasWebsite) },
    { id: 'hours', label: 'Hours', value: fmt(business.hours) },
    { id: 'specialHours', label: 'Special hours', value: fmt(business.specialHours) },
    { id: 'bookingLink', label: 'Booking link', value: fmt(business.bookingLink) },
    { id: 'services', label: 'Services', value: business.services.length ? business.services.join('; ') : '—' },
    {
      id: 'attributes',
      label: 'Attributes',
      value: business.attributes.length ? business.attributes.join('; ') : '—',
    },
    { id: 'gbpScore', label: 'GBP score', value: fmt(business.gbpScore) },
    { id: 'businessStatus', label: 'Business status', value: fmt(business.businessStatus) },
    { id: 'claimed', label: 'Claimed', value: fmt(business.claimed) },
    { id: 'hasPhotos', label: 'Has photos', value: fmt(business.hasPhotos) },
    { id: 'photoCount', label: 'Photo count', value: fmt(business.photoCount) },
    { id: 'latestPhotoDate', label: 'Latest photo', value: fmt(business.latestPhotoDate) },
    { id: 'hasPosts', label: 'Has posts', value: fmt(business.hasPosts) },
    { id: 'postCount', label: 'Post count', value: fmt(business.postCount) },
    { id: 'latestPostDate', label: 'Latest post', value: fmt(business.latestPostDate) },
    { id: 'lat', label: 'Latitude', value: business.lat != null ? business.lat.toFixed(6) : '—' },
    { id: 'lng', label: 'Longitude', value: business.lng != null ? business.lng.toFixed(6) : '—' },
    { id: 'distanceKm', label: 'Distance (km)', value: business.distanceKm != null ? String(business.distanceKm) : '—' },
    { id: 'plusCode', label: 'Plus code', value: fmt(business.plusCode) },
    { id: 'placeId', label: 'Place ID / key', value: fmt(business.placeId) },
    { id: 'placeIdChij', label: 'ChIJ place ID', value: fmt(business.placeIdChij) },
    { id: 'cid', label: 'CID', value: fmt(business.cid) },
    { id: 'hexFid', label: 'Hex FID', value: fmt(business.hexFid) },
    { id: 'knowledgeGraphId', label: 'Knowledge Graph ID', value: fmt(business.knowledgeGraphId) },
    { id: 'businessProfileId', label: 'Business Profile ID', value: fmt(business.businessProfileId) },
    {
      id: 'serviceAreas',
      label: 'Service areas',
      value: business.serviceAreas.length ? business.serviceAreas.join('; ') : '—',
    },
    { id: 'mapsUrl', label: 'Maps URL', value: fmt(business.mapsUrl) },
    { id: 'deepScraped', label: 'Deep scraped', value: fmt(business.deepScraped) },
    { id: 'scrapeError', label: 'Scrape error', value: fmt(business.scrapeError) },
  ];
}

export const MISC_FIELD_LABELS = miscFieldsForBusiness(
  emptyMiscBusiness()
).map((f) => f.label);

function emptyMiscBusiness(): LocalScanBusiness {
  return {
    placeId: '',
    rank: 0,
    name: '',
    primaryCategory: '',
    secondaryCategories: [],
    rating: null,
    reviewCount: null,
    address: '',
    phone: '',
    hasWebsite: false,
    website: '',
    mapsUrl: '',
    lat: null,
    lng: null,
    distanceKm: null,
    services: [],
    attributes: [],
    hours: '',
    specialHours: '',
    bookingLink: '',
    gbpScore: null,
    claimed: null,
    businessStatus: '',
    hasPhotos: null,
    hasPosts: null,
    deepScraped: false,
    placeIdChij: '',
    cid: null,
    hexFid: '',
    knowledgeGraphId: '',
    businessProfileId: null,
    plusCode: '',
    negativeReviewCount: null,
    photoCount: null,
    postCount: null,
    latestPhotoDate: '',
    latestPostDate: '',
    serviceAreas: [],
  };
}
