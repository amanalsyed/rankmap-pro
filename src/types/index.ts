import type { GbpAudit } from '../audit/types';
import type { ValidatedEmail } from '../enrichment/email-validation';
import { normalizeEmailList } from '../enrichment/email-validation';
import { cleanBusinessName } from '../utils/business-name';

export interface EnrichmentFields {
  emails: ValidatedEmail[];
  facebook: string;
  instagram: string;
  linkedin: string;
  twitter: string;
  youtube: string;
  tiktok: string;
  yelp: string;
  yellowpages: string;
  bbb: string;
  angi: string;
  thumbtack: string;
  manta: string;
  foursquare: string;
  mapquest: string;
  otherSocial: string[];
  ownerName: string;
  ownerTitle: string;
  ownerLinkedIn: string;
  ownerSource: string;
  facebookSource: string;
  instagramSource: string;
  linkedinSource: string;
  twitterSource: string;
  tiktokSource: string;
  yelpSource: string;
  yellowpagesSource: string;
  bbbSource: string;
  angiSource: string;
  thumbtackSource: string;
  mantaSource: string;
  foursquareSource: string;
  mapquestSource: string;
  emailSources: string;
  enrichmentStatus: 'pending' | 'partial' | 'done';
}

export function emptyEnrichmentFields(): EnrichmentFields {
  return {
    emails: [],
    facebook: '',
    instagram: '',
    linkedin: '',
    twitter: '',
    youtube: '',
    tiktok: '',
    yelp: '',
    yellowpages: '',
    bbb: '',
    angi: '',
    thumbtack: '',
    manta: '',
    foursquare: '',
    mapquest: '',
    otherSocial: [],
    ownerName: '',
    ownerTitle: '',
    ownerLinkedIn: '',
    ownerSource: '',
    facebookSource: '',
    instagramSource: '',
    linkedinSource: '',
    twitterSource: '',
    tiktokSource: '',
    yelpSource: '',
    yellowpagesSource: '',
    bbbSource: '',
    angiSource: '',
    thumbtackSource: '',
    mantaSource: '',
    foursquareSource: '',
    mapquestSource: '',
    emailSources: '',
    enrichmentStatus: 'pending',
  };
}

export function emptyContactFields() {
  return emptyEnrichmentFields();
}

export function formatMapsRank(rank: number | null | undefined): string {
  if (typeof rank === 'number' && rank > 0) return `#${rank} on Google Maps`;
  return 'N/A';
}

export function normalizeBusinessLead(lead: Partial<BusinessLead> & Pick<BusinessLead, 'id' | 'name'>): BusinessLead {
  const defaults = emptyEnrichmentFields();
  const mapsRank =
    typeof lead.mapsRank === 'number' && lead.mapsRank > 0 ? lead.mapsRank : null;
  return {
    id: lead.id,
    name: cleanBusinessName(lead.name),
    category: lead.category ?? '',
    address: lead.address ?? '',
    phone: lead.phone ?? '',
    rating: lead.rating ?? '',
    reviews: lead.reviews ?? '',
    mapsUrl: lead.mapsUrl ?? '',
    mapsRank,
    hasWebsite: false,
    emails: normalizeEmailList(lead.emails),
    otherSocial: Array.isArray(lead.otherSocial) ? lead.otherSocial : defaults.otherSocial,
    facebook: lead.facebook ?? defaults.facebook,
    instagram: lead.instagram ?? defaults.instagram,
    linkedin: lead.linkedin ?? defaults.linkedin,
    twitter: lead.twitter ?? defaults.twitter,
    youtube: lead.youtube ?? defaults.youtube,
    tiktok: lead.tiktok ?? defaults.tiktok,
    yelp: lead.yelp ?? defaults.yelp,
    yellowpages: lead.yellowpages ?? defaults.yellowpages,
    bbb: lead.bbb ?? defaults.bbb,
    angi: lead.angi ?? defaults.angi,
    thumbtack: lead.thumbtack ?? defaults.thumbtack,
    manta: lead.manta ?? defaults.manta,
    foursquare: lead.foursquare ?? defaults.foursquare,
    mapquest: lead.mapquest ?? defaults.mapquest,
    ownerName: lead.ownerName ?? defaults.ownerName,
    ownerTitle: lead.ownerTitle ?? defaults.ownerTitle,
    ownerLinkedIn: lead.ownerLinkedIn ?? defaults.ownerLinkedIn,
    ownerSource: lead.ownerSource ?? defaults.ownerSource,
    facebookSource: lead.facebookSource ?? defaults.facebookSource,
    instagramSource: lead.instagramSource ?? defaults.instagramSource,
    linkedinSource: lead.linkedinSource ?? defaults.linkedinSource,
    twitterSource: lead.twitterSource ?? defaults.twitterSource,
    tiktokSource: lead.tiktokSource ?? defaults.tiktokSource,
    yelpSource: lead.yelpSource ?? defaults.yelpSource,
    yellowpagesSource: lead.yellowpagesSource ?? defaults.yellowpagesSource,
    bbbSource: lead.bbbSource ?? defaults.bbbSource,
    angiSource: lead.angiSource ?? defaults.angiSource,
    thumbtackSource: lead.thumbtackSource ?? defaults.thumbtackSource,
    mantaSource: lead.mantaSource ?? defaults.mantaSource,
    foursquareSource: lead.foursquareSource ?? defaults.foursquareSource,
    mapquestSource: lead.mapquestSource ?? defaults.mapquestSource,
    emailSources: lead.emailSources ?? defaults.emailSources,
    enrichmentStatus: lead.enrichmentStatus ?? defaults.enrichmentStatus,
    gbpAudit: lead.gbpAudit ?? undefined,
    scanCity: lead.scanCity ?? '',
  };
}

export function normalizeScanState(raw: Partial<ScanState> | null | undefined): ScanState {
  if (!raw) return { ...DEFAULT_SCAN_STATE, results: [], progress: { ...DEFAULT_SCAN_STATE.progress } };

  const results = Array.isArray(raw.results)
    ? raw.results
        .filter((lead) => Boolean(lead?.id && lead?.name))
        .map((lead) => normalizeBusinessLead(lead as Partial<BusinessLead> & { id: string; name: string }))
    : [];

  return {
    params: raw.params ?? null,
    results,
    sessionId: raw.sessionId ?? null,
    sessionName: raw.sessionName ?? null,
    viewingArchived: raw.viewingArchived ?? false,
    progress: {
      ...DEFAULT_SCAN_STATE.progress,
      ...(raw.progress ?? {}),
      enriching: raw.progress?.enriching ?? 0,
    },
    batchScan: raw.batchScan ?? null,
    enrichmentActive: raw.enrichmentActive ?? false,
  };
}

export interface BusinessLead extends EnrichmentFields {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  rating: string;
  reviews: string;
  mapsUrl: string;
  /** Position in the full Google Maps search results (1-based), or null if unknown. */
  mapsRank: number | null;
  hasWebsite: false;
  gbpAudit?: GbpAudit;
  /** City from the batch scan that found this lead (empty for single-city scans). */
  scanCity?: string;
}

export interface BatchScanConfig {
  niche: string;
  cities: string[];
  countPerCity: number;
  currentCityIndex: number;
  active: boolean;
}

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'paused' | 'complete' | 'error' | 'enriching';
  checked: number;
  withoutWebsite: number;
  target: number;
  enriching?: number;
  message?: string;
  /** Batch scan: current city label */
  batchCity?: string;
  batchCityIndex?: number;
  batchCityTotal?: number;
}

export interface ScanParams {
  niche: string;
  location: string;
  count: number;
}

export interface ScanState {
  progress: ScanProgress;
  results: BusinessLead[];
  params: ScanParams | null;
  /** Active or viewed scan session id */
  sessionId?: string | null;
  /** Display name, e.g. "Miami plumbers – Mar 2026" */
  sessionName?: string | null;
  /** True when viewing a saved session from history (not the live workspace) */
  viewingArchived?: boolean;
  /** Multi-city batch scan configuration (null when not batching). */
  batchScan?: BatchScanConfig | null;
  /** True when this scan session may run contact enrichment (Free: 1 scan/month). */
  enrichmentActive?: boolean;
}

export type MessageType =
  | { type: 'START_SCAN'; params: ScanParams }
  | { type: 'START_BATCH_SCAN'; niche: string; citiesText: string; countPerCity: number }
  | { type: 'STOP_SCAN' }
  | { type: 'PAUSE_SCAN' }
  | { type: 'RESUME_SCAN' }
  | { type: 'OPEN_RESULTS' }
  | { type: 'OPEN_DASHBOARD'; tab?: import('../dashboard/open-dashboard').DashboardTabId }
  | { type: 'OPEN_HISTORY' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'OPEN_AUDIT'; leadId: string }
  | { type: 'AUDIT_GBP'; leadId: string; openWhenDone?: boolean }
  | { type: 'GET_AUDIT_QUEUE' }
  | { type: 'SET_AUDIT_OPEN_WHEN_DONE'; key: string; kind: 'scan' | 'standalone'; openWhenDone: boolean }
  | { type: 'OPEN_AUDIT_REPORT'; key: string; kind: 'scan' | 'standalone' }
  | { type: 'AUDIT_QUEUE_UPDATE'; queue: import('../gbp-audit/audit-queue-types').AuditQueueSnapshot }
  | {
      type: 'GBP_AUDIT_COMPLETE';
      key: string;
      kind: 'scan' | 'standalone';
      name: string;
      score: number | null;
      status: string;
      reportUrl: string;
    }
  | { type: 'REFRESH_STANDALONE_AUDIT'; placeId: string }
  | { type: 'RUN_GBP_AUDIT'; lead: BusinessLead }
  | { type: 'GET_STATE' }
  | { type: 'LIST_SCAN_SESSIONS' }
  | { type: 'GET_SCAN_SESSION'; sessionId: string }
  | { type: 'LOAD_SCAN_SESSION'; sessionId: string }
  | { type: 'DELETE_SCAN_SESSION'; sessionId: string }
  | { type: 'RENAME_SCAN_SESSION'; sessionId: string; name: string }
  | { type: 'SCAN_SESSIONS_UPDATE'; store: import('../scan-sessions/types').ScanSessionStore }
  | { type: 'GET_ENRICHMENT_SETTINGS' }
  | { type: 'SET_ENRICHMENT_SETTINGS'; settings: import('../settings/enrichment-settings').EnrichmentSettings }
  | { type: 'ENRICHMENT_SETTINGS_UPDATE'; settings: import('../settings/enrichment-settings').EnrichmentSettings }
  | { type: 'GET_WHITE_LABEL_SETTINGS' }
  | { type: 'SET_WHITE_LABEL_SETTINGS'; settings: import('../settings/white-label-settings').WhiteLabelSettings }
  | { type: 'WHITE_LABEL_SETTINGS_UPDATE'; settings: import('../settings/white-label-settings').WhiteLabelSettings }
  | { type: 'SCAN_PROGRESS'; progress: ScanProgress }
  | { type: 'SCAN_RESULT'; business: BusinessLead }
  | { type: 'SCAN_COMPLETE'; progress: ScanProgress; results?: BusinessLead[] }
  | { type: 'SCAN_ERROR'; message: string }
  | { type: 'UPDATE_LEAD'; business: BusinessLead }
  | { type: 'PARSE_SEARCH' }
  | { type: 'PING_SEARCH' }
  | { type: 'STATE_UPDATE'; state: ScanState }
  | { type: 'STANDALONE_GBP_AUDIT'; request: import('../gbp-audit/types').StandaloneGbpAuditRequest; openWhenDone?: boolean }
  | { type: 'OPEN_STANDALONE_AUDIT'; placeId: string }
  | { type: 'GET_GBP_AUDIT_STORE' }
  | { type: 'GET_GBP_AUDIT_ENTRY'; placeId: string }
  | { type: 'LIST_GBP_AUDIT_HISTORY' }
  | { type: 'GET_GBP_AUDIT_HISTORY'; auditId: string }
  | { type: 'DELETE_GBP_AUDIT_HISTORY'; auditId: string }
  | {
      type: 'STANDALONE_GBP_AUDIT_DONE';
      placeId: string;
      score: number | null;
      status: string;
      auditedAt?: string;
    };

export const DEFAULT_SCAN_STATE: ScanState = {
  progress: {
    status: 'idle',
    checked: 0,
    withoutWebsite: 0,
    target: 0,
    enriching: 0,
  },
  results: [],
  params: null,
  sessionId: null,
  sessionName: null,
  viewingArchived: false,
  batchScan: null,
};

export function buildMapsSearchUrl(niche: string, location: string): string {
  const query = encodeURIComponent(`${niche} in ${location}`);
  return `https://www.google.com/maps/search/${query}`;
}

export function buildGoogleSearchUrl(niche: string, location: string): string {
  const query = encodeURIComponent(`${niche} ${location}`.trim());
  return `https://www.google.com/search?q=${query}&hl=en`;
}
