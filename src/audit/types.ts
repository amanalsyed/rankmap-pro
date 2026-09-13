export type AuditFindingStatus = 'good' | 'needs_improvement' | 'critical';

export interface AuditFinding {
  id: string;
  label: string;
  status: AuditFindingStatus;
  message: string;
}

export interface AuditLink {
  label: string;
  url: string;
  description?: string;
}

export interface AuditLinkGroup {
  title: string;
  links: AuditLink[];
}

export interface GbpProfileSnapshot {
  name: string;
  address: string;
  phone: string;
  website: string;
  hasWebsite: boolean;
  claimed: boolean | null;
  lat: number | null;
  lng: number | null;
  placeId: string;
  cid: string | null;
  knowledgeGraphId: string;
  businessProfileId: string | null;
  hexFid: string;
  mapsUrl: string;
  primaryCategory: string;
  secondaryCategories: string[];
  hours: string;
  specialHours: string;
  bookingLink: string;
  servicesLink: string;
  services: string[];
  attributes: string[];
  serviceAreas: string[];
  reviewCount: number | null;
  negativeReviewCount: number | null;
  rating: number | null;
  photoCount: number | null;
  hasPhotos: boolean | null;
  postCount: number | null;
  hasPosts: boolean | null;
  latestPostDate: string;
  latestPhotoDate: string;
  businessStatus: string;
  plusCode: string;
}

export interface GbpAudit {
  status: 'pending' | 'running' | 'done' | 'error';
  auditedAt: string;
  score: number | null;
  snapshot: GbpProfileSnapshot;
  critical: AuditFinding[];
  needsImprovement: AuditFinding[];
  good: AuditFinding[];
  linkGroups: AuditLinkGroup[];
  errorMessage?: string;
}

export function emptyGbpAudit(): GbpAudit {
  return {
    status: 'pending',
    auditedAt: '',
    score: null,
    snapshot: emptySnapshot(),
    critical: [],
    needsImprovement: [],
    good: [],
    linkGroups: [],
  };
}

export function emptySnapshot(): GbpProfileSnapshot {
  return {
    name: '',
    address: '',
    phone: '',
    website: '',
    hasWebsite: false,
    claimed: null,
    lat: null,
    lng: null,
    placeId: '',
    cid: null,
    knowledgeGraphId: '',
    businessProfileId: null,
    hexFid: '',
    mapsUrl: '',
    primaryCategory: '',
    secondaryCategories: [],
    hours: '',
    specialHours: '',
    bookingLink: '',
    servicesLink: '',
    services: [],
    attributes: [],
    serviceAreas: [],
    reviewCount: null,
    negativeReviewCount: null,
    rating: null,
    photoCount: null,
    hasPhotos: null,
    postCount: null,
    hasPosts: null,
    latestPostDate: '',
    latestPhotoDate: '',
    businessStatus: '',
    plusCode: '',
  };
}
