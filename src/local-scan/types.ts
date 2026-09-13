export interface LocalScanBusiness {
  placeId: string;
  rank: number;
  name: string;
  primaryCategory: string;
  secondaryCategories: string[];
  rating: number | null;
  reviewCount: number | null;
  address: string;
  phone: string;
  hasWebsite: boolean;
  website: string;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  services: string[];
  attributes: string[];
  hours: string;
  specialHours: string;
  bookingLink: string;
  gbpScore: number | null;
  claimed: boolean | null;
  businessStatus: string;
  hasPhotos: boolean | null;
  hasPosts: boolean | null;
  deepScraped: boolean;
  scrapeError?: string;
  /** Extended GBP fields (deep scan). */
  placeIdChij: string;
  cid: string | null;
  hexFid: string;
  knowledgeGraphId: string;
  businessProfileId: string | null;
  plusCode: string;
  negativeReviewCount: number | null;
  photoCount: number | null;
  postCount: number | null;
  latestPhotoDate: string;
  latestPostDate: string;
  serviceAreas: string[];
}

export interface LocalScanSearchContext {
  keyword: string;
  searchCenterLat: number | null;
  searchCenterLng: number | null;
  mapsUrl: string;
}

export interface Search3PackEntry {
  rank: number;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  mapsUrl: string;
}

export type LocalScanMode = 'quick' | 'deep';

export interface LocalScanSession {
  id: string;
  mode: LocalScanMode;
  createdAt: string;
  context: LocalScanSearchContext;
  businesses: LocalScanBusiness[];
  search3Pack?: Search3PackEntry[];
  fromCache?: boolean;
}

export interface LocalScanStore {
  sessions: LocalScanSession[];
  latestSessionId: string | null;
}

export interface LocalScanCacheEntry {
  key: string;
  session: LocalScanSession;
  savedAt: string;
}

export function emptyLocalScanBusiness(
  partial: Pick<LocalScanBusiness, 'placeId' | 'rank' | 'name' | 'mapsUrl'> &
    Partial<LocalScanBusiness>
): LocalScanBusiness {
  return {
    primaryCategory: '',
    secondaryCategories: [],
    rating: null,
    reviewCount: null,
    address: '',
    phone: '',
    hasWebsite: false,
    website: '',
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
    ...partial,
  };
}

export function emptyLocalScanStore(): LocalScanStore {
  return { sessions: [], latestSessionId: null };
}
