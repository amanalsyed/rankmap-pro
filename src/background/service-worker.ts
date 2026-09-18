import {
  buildMapsSearchUrl,
  buildGoogleSearchUrl,
  emptyContactFields,
  normalizeBusinessLead,
  normalizeScanState,
  type BusinessLead,
  type ScanParams,
  type ScanProgress,
  type ScanState,
} from '../types';
import { parseCityList } from '../utils/parse-cities';
import { buildGbpAudit, mergeLeadIntoSnapshot } from '../audit/scoring';
import { emptyGbpAudit } from '../audit/types';
import type { GbpProfileSnapshot } from '../audit/types';
import {
  buildSearchQueries,
  classifySocialUrl,
  extractOwnerInfo,
  isBusinessEmail,
  isUsefulEmail,
  searchUrl,
  socialProfileMatchesBusiness,
  businessMatchesContext,
} from '../enrichment/search-utils';
import type { SearchParseResult, SearchQuery } from '../enrichment/search-utils';
import {
  enrichEmailsWithMx,
  mergeEmailRecords,
  normalizeEmailList,
  pickBestValidatedEmails,
  type EmailCandidate,
} from '../enrichment/email-validation';
import {
  normalizeEnrichmentSettings,
  readEnrichmentSettings,
  writeEnrichmentSettings,
  type EnrichmentSettings,
} from '../settings/enrichment-settings';
import {
  normalizeWhiteLabelSettings,
  readWhiteLabelSettings,
  writeWhiteLabelSettings,
} from '../settings/white-label-settings';
import {
  appendAuditHistory,
  deleteAuditHistory,
  getAuditHistoryById,
  getStandaloneEntry,
  listAuditHistory,
  readGbpAuditStore,
  upsertStandaloneEntry,
} from '../gbp-audit/store';
import { setAuditEnrichmentHandler, triggerAuditEnrichment } from '../gbp-audit/audit-enrichment-hook';
import {
  openStandaloneAuditPage,
  queueStandaloneGbpAudit,
  scrapePlaceForDeepScan,
} from '../gbp-audit/standalone-audit';
import { openScanAuditPage } from '../gbp-audit/open-audit';
import {
  enqueueAuditQueueItem,
  getAuditQueueSnapshot,
  markAuditQueueFinished,
  markAuditQueueRunning,
  setAuditQueueOpenWhenDone,
} from '../gbp-audit/audit-queue-state';
import {
  handleAuditQueueItemComplete,
  installAuditNotificationClickHandler,
} from '../gbp-audit/audit-notifications';
import {
  computeScanSummaryStats,
  formatScanFullyCompleteMessage,
  formatScanListingCompleteMessage,
} from '../scan/scan-summary';
import {
  installScanNotificationClickHandler,
  notifyScanFullyComplete,
  notifyScanListingComplete,
} from '../scan/scan-notifications';
import { prepareAuditTabAndScrape } from '../gbp-audit/audit-tab';
import { harvestSearchProfileFields } from '../gbp-audit/search-profile-harvest';
import type { StandaloneGbpAuditRequest } from '../gbp-audit/types';
import {
  archiveCurrentScanIfNeeded,
  createSession,
  createBatchSession,
  loadSessionIntoState,
  deleteScanSession,
  readScanSessionStore,
  renameScanSession,
  syncActiveSession,
} from '../scan-sessions/store';
import { emptyScanSessionStore } from '../scan-sessions/types';
import {
  consumeScanQuota,
  consumeAuditQuota,
  consumeDeepScanQuota,
  consumeEnrichmentScanQuota,
  checkDeepScanQuota,
  consumeQuickScanQuota,
  checkQuickScanQuota,
  getCurrentUser,
  getCachedUserState,
  refreshUserState,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  resetPassword,
  ensureAnonymousUser,
} from '../supabase/auth';
import { logActivity } from '../supabase/activity';
import { getActivePlanContext, clampScanCount } from '../supabase/plan-guard';
import { upgradeMessage } from '../supabase/plan-capabilities';
import { isSupabaseConfigured } from '../supabase/client';
import { signInWithGoogle, isGoogleAuthConfigured } from '../supabase/google-auth';
import {
  buildScanCacheKey,
  deleteLocalScanSession,
  getLatestLocalScanSession,
  getLocalScanSession,
  listLocalScanSessions,
  saveLocalScanSession,
  saveScanCache,
} from '../local-scan/store';
import { localScanHistoryUrl, openLocalScanPage } from '../local-scan/open-local-scan';
import type { LocalScanSession, Search3PackEntry } from '../local-scan/types';
import { checkRank, locateBusiness } from '../rank-check/rank-search';
import type { RankCheckRequest } from '../rank-check/rank-search';
import { dashboardPageUrl, parseDashboardTab } from '../dashboard/open-dashboard';
import {
  readScopedHistoryValue,
  syncHistoryScopeWithAuth,
  writeScopedHistoryValue,
} from '../storage/history-scope';

const STORAGE_KEY = 'scanState' as const;

const EMPTY_SEARCH_PARSE: SearchParseResult = { links: [], emails: [], text: '', results: [] };

async function userHasPersistentHistory(): Promise<boolean> {
  const state = await getCachedUserState();
  return (state.profile?.plan ?? 'free') !== 'free';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await sleep(250);
  }
}

async function fetchSearch3Pack(keyword: string): Promise<Search3PackEntry[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=en`;
  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    if (!tabId) return [];
    await waitForTabComplete(tabId, 18000);
    await sleep(1200);
    const response = (await chrome.tabs.sendMessage(tabId, { type: 'PARSE_LOCAL_3PACK' })) as {
      entries?: Search3PackEntry[];
    };
    return response?.entries ?? [];
  } catch {
    return [];
  } finally {
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // ignore
      }
    }
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readState(): Promise<ScanState> {
  const stored = await readScopedHistoryValue<ScanState>(STORAGE_KEY);
  return normalizeScanState(stored);
}

async function mutateState(mutator: (state: ScanState) => void): Promise<ScanState> {
  return enqueue(async () => {
    const state = await readState();
    mutator(state);
    state.progress.withoutWebsite = state.results.length;
    await writeScopedHistoryValue(STORAGE_KEY, state);
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {});
    scheduleSessionSync(state);
    return state;
  });
}

let sessionSyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSessionSync(state: ScanState): void {
  if (!state.sessionId || state.viewingArchived) return;
  if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
  sessionSyncTimer = setTimeout(() => {
    sessionSyncTimer = null;
    void readState().then((latest) => {
      if (latest.sessionId && !latest.viewingArchived) {
        void syncActiveSession(latest);
      }
    });
  }, 1200);
}

async function flushSessionSync(state?: ScanState): Promise<void> {
  if (sessionSyncTimer) {
    clearTimeout(sessionSyncTimer);
    sessionSyncTimer = null;
  }
  const latest = state ?? (await readState());
  if (latest.sessionId && !latest.viewingArchived) {
    await syncActiveSession(latest);
  }
}

async function resetState(
  params: ScanParams,
  sessionId: string,
  sessionName: string,
  enrichmentActive = false
): Promise<ScanState> {
  return mutateState((state) => {
    state.params = params;
    state.results = [];
    state.sessionId = sessionId;
    state.sessionName = sessionName;
    state.viewingArchived = false;
    state.batchScan = null;
    state.enrichmentActive = enrichmentActive;
    state.progress = {
      status: 'scanning',
      checked: 0,
      withoutWebsite: 0,
      target: params.count,
      enriching: 0,
    };
  });
}

async function reserveEnrichmentForScan(plan: import('../supabase/types').Plan): Promise<boolean> {
  const settings = await readEnrichmentSettings();
  if (!settings.enrichDuringScan) return false;

  if (plan !== 'free') return true;

  const quota = await consumeEnrichmentScanQuota();
  return quota.allowed;
}

async function scanEnrichmentAllowed(): Promise<boolean> {
  const { plan, capabilities } = await getActivePlanContext();
  if (!capabilities.enrichmentEnabled) return false;
  if (plan !== 'free') return true;
  const state = await readState();
  return state.enrichmentActive === true;
}

function applyBatchProgressMeta(state: ScanState): void {
  if (!state.batchScan?.active) return;
  const idx = state.batchScan.currentCityIndex;
  state.progress.batchCity = state.batchScan.cities[idx] ?? state.params?.location ?? '';
  state.progress.batchCityIndex = idx + 1;
  state.progress.batchCityTotal = state.batchScan.cities.length;
}

function tagLeadWithScanCity(lead: BusinessLead, city: string): BusinessLead {
  if (!city) return lead;
  return normalizeBusinessLead({ ...lead, scanCity: city });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function mergeLeads(state: ScanState, leads: BusinessLead[]): void {
  for (const raw of leads) {
    if (!raw?.id) continue;
    const lead = normalizeBusinessLead(raw);
    const index = state.results.findIndex((existing) => existing.id === lead.id);
    if (index === -1) {
      state.results.push(lead);
      continue;
    }
    const prev = state.results[index];
    state.results[index] = normalizeBusinessLead({
      ...prev,
      ...lead,
      mapsRank: lead.mapsRank ?? prev.mapsRank,
      emails: mergeEmailRecords(normalizeEmailList(prev.emails), normalizeEmailList(lead.emails)),
      otherSocial: uniqueStrings([...(prev.otherSocial ?? []), ...(lead.otherSocial ?? [])]),
      facebook: lead.facebook || prev.facebook,
      instagram: lead.instagram || prev.instagram,
      linkedin: lead.linkedin || prev.linkedin,
      twitter: lead.twitter || prev.twitter,
      youtube: lead.youtube || prev.youtube,
      tiktok: lead.tiktok || prev.tiktok,
      yelp: lead.yelp || prev.yelp,
      yellowpages: lead.yellowpages || prev.yellowpages,
      bbb: lead.bbb || prev.bbb,
      angi: lead.angi || prev.angi,
      thumbtack: lead.thumbtack || prev.thumbtack,
      manta: lead.manta || prev.manta,
      foursquare: lead.foursquare || prev.foursquare,
      mapquest: lead.mapquest || prev.mapquest,
      ownerName: lead.ownerName || prev.ownerName,
      ownerTitle: lead.ownerTitle || prev.ownerTitle,
      ownerLinkedIn: lead.ownerLinkedIn || prev.ownerLinkedIn,
      ownerSource: lead.ownerSource || prev.ownerSource,
      facebookSource: lead.facebookSource || prev.facebookSource,
      instagramSource: lead.instagramSource || prev.instagramSource,
      linkedinSource: lead.linkedinSource || prev.linkedinSource,
      twitterSource: lead.twitterSource || prev.twitterSource,
      tiktokSource: lead.tiktokSource || prev.tiktokSource,
      yelpSource: lead.yelpSource || prev.yelpSource,
      yellowpagesSource: lead.yellowpagesSource || prev.yellowpagesSource,
      bbbSource: lead.bbbSource || prev.bbbSource,
      angiSource: lead.angiSource || prev.angiSource,
      thumbtackSource: lead.thumbtackSource || prev.thumbtackSource,
      mantaSource: lead.mantaSource || prev.mantaSource,
      foursquareSource: lead.foursquareSource || prev.foursquareSource,
      mapquestSource: lead.mapquestSource || prev.mapquestSource,
      emailSources: lead.emailSources || prev.emailSources,
      enrichmentStatus: lead.enrichmentStatus || prev.enrichmentStatus,
      gbpAudit: lead.gbpAudit ?? prev.gbpAudit,
      scanCity: lead.scanCity || prev.scanCity,
    });
  }
}

let activeTabId: number | null = null;
let auditTabId: number | null = null;
let resultsTabId: number | null = null;
let searchTabId: number | null = null;
let enrichQueue: BusinessLead[] = [];
let enriching = false;

interface AuditEnrichJob {
  lead: BusinessLead;
  persist: 'scan' | 'standalone';
  placeId: string;
}

let auditEnrichQueue: AuditEnrichJob[] = [];
let auditEnriching = false;
let stopEnrichment = false;
let searchLocation = '';
let searchCategory = '';
let enrichActiveCount = 0;
let auditQueue: Array<{ leadId: string; openWhenDone: boolean }> = [];
let auditing = false;

installAuditNotificationClickHandler();
installScanNotificationClickHandler(() => openResultsPage());

async function openAuditPage(leadId: string): Promise<void> {
  await openScanAuditPage(leadId);
}

function absoluteMapsUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `https://www.google.com${url.startsWith('/') ? '' : '/'}${url}`;
}

async function ensureMapsTabForAudit(mapsUrl: string): Promise<number | null> {
  const target = absoluteMapsUrl(mapsUrl);
  if (!target) return null;

  // Never reuse the scan tab — auditing navigates away and would kill an in-progress scan.
  if (auditTabId) {
    try {
      await chrome.tabs.get(auditTabId);
      await chrome.tabs.update(auditTabId, { url: target, active: false });
      return auditTabId;
    } catch {
      auditTabId = null;
    }
  }

  const tab = await chrome.tabs.create({ url: target, active: false });
  auditTabId = tab.id ?? null;
  return auditTabId;
}

function queueGbpAudit(leadId: string, openWhenDone = false): void {
  if (!leadId) return;
  const existing = auditQueue.find((item) => item.leadId === leadId);
  if (existing) {
    if (openWhenDone) existing.openWhenDone = true;
    return;
  }

  void readState().then((state) => {
    const lead = state.results.find((item) => item.id === leadId);
    enqueueAuditQueueItem({
      key: leadId,
      kind: 'scan',
      name: lead?.name ?? 'Business',
      openWhenDone,
    });
  });

  auditQueue.push({ leadId, openWhenDone });
  void runAuditQueue();
}

async function runAuditQueue(): Promise<void> {
  if (auditing) return;
  auditing = true;

  while (auditQueue.length > 0) {
    const item = auditQueue.shift();
    if (item) {
      await runGbpAuditForLead(item.leadId, item.openWhenDone);
    }
  }

  auditing = false;
  if (auditQueue.length > 0) void runAuditQueue();
}

async function runGbpAuditForLead(leadId: string, openWhenDone: boolean): Promise<void> {
  const state = await readState();
  const lead = state.results.find((item) => item.id === leadId);
  if (!lead) {
    markAuditQueueFinished({ key: leadId, kind: 'scan', status: 'error', score: null });
    return;
  }

  markAuditQueueRunning(leadId, 'scan');

  const runningAudit = { ...emptyGbpAudit(), status: 'running' as const, auditedAt: new Date().toISOString() };
  await mutateState((s) => {
    mergeLeads(s, [{ ...lead, gbpAudit: runningAudit }]);
  });

  let snapshotPartial: Partial<GbpProfileSnapshot> = {};
  let errorMessage = '';

  if (lead.mapsUrl) {
    const tabId = await ensureMapsTabForAudit(lead.mapsUrl);
    if (tabId) {
      const result = await prepareAuditTabAndScrape(tabId, lead);
      if (result.snapshot) snapshotPartial = result.snapshot;
      else errorMessage = result.errorMessage;
    } else {
      errorMessage = 'Could not open Google Maps for audit.';
    }
  } else {
    errorMessage = 'No Google Maps URL available for this lead.';
  }

  const snapshot = mergeLeadIntoSnapshot(lead, { ...snapshotPartial, hasWebsite: snapshotPartial.hasWebsite ?? false });
  const audit = buildGbpAudit(snapshot, lead);
  if (errorMessage && audit.critical.length === 0 && !snapshot.address && !snapshot.phone) {
    audit.status = 'done';
    audit.errorMessage = errorMessage;
  }

  await mutateState((s) => {
    mergeLeads(s, [{ ...lead, gbpAudit: audit }]);
  });

  if (audit.status === 'done') {
    await appendAuditHistory(
      {
        placeId: lead.id,
        name: lead.name,
        mapsUrl: lead.mapsUrl,
        audit,
        auditedAt: audit.auditedAt ?? new Date().toISOString(),
        emails: lead.emails ?? [],
        facebook: lead.facebook ?? '',
        instagram: lead.instagram ?? '',
        linkedin: lead.linkedin ?? '',
        twitter: lead.twitter ?? '',
        youtube: lead.youtube ?? '',
        tiktok: lead.tiktok ?? '',
        yelp: lead.yelp ?? '',
        yellowpages: lead.yellowpages ?? '',
        bbb: lead.bbb ?? '',
        angi: lead.angi ?? '',
        thumbtack: lead.thumbtack ?? '',
        manta: lead.manta ?? '',
        foursquare: lead.foursquare ?? '',
        mapquest: lead.mapquest ?? '',
        otherSocial: lead.otherSocial ?? [],
        ownerName: lead.ownerName ?? '',
        ownerTitle: lead.ownerTitle ?? '',
        ownerLinkedIn: lead.ownerLinkedIn ?? '',
        ownerSource: lead.ownerSource ?? '',
        facebookSource: lead.facebookSource ?? '',
        instagramSource: lead.instagramSource ?? '',
        linkedinSource: lead.linkedinSource ?? '',
        twitterSource: lead.twitterSource ?? '',
        tiktokSource: lead.tiktokSource ?? '',
        yelpSource: lead.yelpSource ?? '',
        yellowpagesSource: lead.yellowpagesSource ?? '',
        bbbSource: lead.bbbSource ?? '',
        angiSource: lead.angiSource ?? '',
        thumbtackSource: lead.thumbtackSource ?? '',
        mantaSource: lead.mantaSource ?? '',
        foursquareSource: lead.foursquareSource ?? '',
        mapquestSource: lead.mapquestSource ?? '',
        emailSources: lead.emailSources ?? '',
        enrichmentStatus: lead.enrichmentStatus ?? 'pending',
      },
      'scan',
      { leadId: lead.id }
    );
  }

  const queueItem = markAuditQueueFinished({
    key: leadId,
    kind: 'scan',
    status: audit.status === 'done' ? 'done' : 'error',
    score: audit.score,
  });
  if (queueItem) {
    queueItem.openWhenDone = openWhenDone;
    await handleAuditQueueItemComplete(queueItem);
  }

  if (audit.status === 'done') {
    triggerAuditEnrichment({ ...lead, gbpAudit: audit });
  }
}

function resultsPageUrl(): string {
  return chrome.runtime.getURL('src/results/index.html');
}

async function openResultsPage(): Promise<void> {
  const target = resultsPageUrl();

  if (resultsTabId) {
    try {
      const tab = await chrome.tabs.get(resultsTabId);
      if (tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {
      resultsTabId = null;
    }
  }

  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find((tab) => tab.url?.startsWith(target) || tab.url?.includes('/src/results/index.html'));
  if (existing?.id) {
    resultsTabId = existing.id;
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }

  const tab = await chrome.tabs.create({ url: target, active: true });
  resultsTabId = tab.id ?? null;
}

async function waitForContentScript(tabId: number, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response?.ok) return true;
    } catch {
      // Content script not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function launchMapsScan(params: ScanParams): Promise<void> {
  const mapsUrl = buildMapsSearchUrl(params.niche, params.location);
  const searchUrl = buildGoogleSearchUrl(params.niche, params.location);

  let tabId = activeTabId;

  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.includes('google.com/search')) {
        await chrome.tabs.update(tabId, { url: searchUrl, active: true });
      } else if (tab.url?.includes('google.com/maps')) {
        await chrome.tabs.update(tabId, { url: mapsUrl, active: true });
      } else {
        tabId = null;
      }
    } catch {
      tabId = null;
    }
  }

  if (!tabId) {
    const tab = await chrome.tabs.create({ url: mapsUrl, active: true });
    tabId = tab.id ?? null;
  }

  if (!tabId) {
    await mutateState((state) => {
      state.progress.status = 'error';
      state.progress.message = 'Could not open Google Maps tab.';
    });
    return;
  }

  activeTabId = tabId;

  const onUpdated = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
    if (updatedTabId !== tabId || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    void injectAndStart(tabId!, params);
  };

  chrome.tabs.onUpdated.addListener(onUpdated);

  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    void injectAndStart(tabId, params);
  }
}

async function startScan(params: ScanParams): Promise<void> {
  stopEnrichment = false;
  enrichQueue = [];
  enrichActiveCount = 0;
  searchLocation = params.location;
  searchCategory = params.niche;

  const current = await readState();
  await archiveCurrentScanIfNeeded(current);

  const session = await createSession(params);
  const enrichmentActive = await reserveEnrichmentForScan((await getActivePlanContext()).plan);
  await resetState(params, session.id, session.name, enrichmentActive);
  void openResultsPage();
  await launchMapsScan(params);
}

async function startBatchScan(niche: string, citiesText: string, countPerCity: number): Promise<void> {
  const cities = parseCityList(citiesText);
  if (cities.length === 0 || !niche.trim()) return;

  const count = Math.max(1, Math.min(500, countPerCity || 100));
  stopEnrichment = false;
  enrichQueue = [];
  enrichActiveCount = 0;
  searchCategory = niche.trim();

  const current = await readState();
  await archiveCurrentScanIfNeeded(current);

  const session = await createBatchSession(niche.trim(), cities, count);
  const firstParams: ScanParams = { niche: niche.trim(), location: cities[0], count };
  const enrichmentActive = await reserveEnrichmentForScan((await getActivePlanContext()).plan);

  await mutateState((state) => {
    state.params = firstParams;
    state.results = [];
    state.sessionId = session.id;
    state.sessionName = session.name;
    state.viewingArchived = false;
    state.enrichmentActive = enrichmentActive;
    state.batchScan = {
      niche: niche.trim(),
      cities,
      countPerCity: count,
      currentCityIndex: 0,
      active: true,
    };
    state.progress = {
      status: 'scanning',
      checked: 0,
      withoutWebsite: 0,
      target: count,
      enriching: 0,
    };
    applyBatchProgressMeta(state);
  });

  searchLocation = cities[0];
  void openResultsPage();
  await launchMapsScan(firstParams);
}

async function startNextBatchCity(index: number): Promise<void> {
  const state = await readState();
  const batch = state.batchScan;
  if (!batch?.active || index >= batch.cities.length) return;

  const city = batch.cities[index];
  const params: ScanParams = {
    niche: batch.niche,
    location: city,
    count: batch.countPerCity,
  };

  stopEnrichment = false;
  enrichQueue = [];
  enrichActiveCount = 0;
  searchLocation = city;

  await mutateState((s) => {
    if (!s.batchScan) return;
    s.batchScan.currentCityIndex = index;
    s.params = params;
    s.progress = {
      status: 'scanning',
      checked: 0,
      withoutWebsite: s.results.length,
      target: params.count,
      enriching: 0,
      message: undefined,
    };
    applyBatchProgressMeta(s);
  });

  await launchMapsScan(params);
}

async function finalizeScanFullyComplete(
  options: { stopped?: boolean; batchFinished?: boolean } = {}
): Promise<void> {
  const state = await readState();
  const batchActive = state.batchScan?.active === true;

  if (batchActive && !options.stopped && !options.batchFinished) {
    void maybeAdvanceBatchScan();
    return;
  }

  const stats = computeScanSummaryStats(state.progress, state.results.length);
  const message = formatScanFullyCompleteMessage(stats, {
    stopped: options.stopped,
    batchFinished: options.batchFinished,
    batchCities: state.batchScan?.cities.length ?? state.progress.batchCityTotal,
    totalLeads: state.results.length,
  });

  await mutateState((s) => {
    s.progress.status = 'complete';
    s.progress.message = message;
    s.progress.enriching = 0;
    if (options.batchFinished && s.batchScan) {
      s.batchScan.active = false;
    }
  });
  await flushSessionSync();
  await notifyScanFullyComplete(message);
  logActivity('scan_completed', {
    checked: stats.checked,
    target: stats.target,
    leads: stats.leads,
    skipped: stats.skipped,
    notScanned: stats.notScanned,
    stopped: options.stopped ?? false,
  });
}

async function handleListingScanFinished(stopped = false): Promise<void> {
  const state = await readState();
  const enrichingCount = enrichActiveCount + enrichQueue.length;
  const settings = await readEnrichmentSettings();
  const willEnrich = settings.enrichDuringScan && enrichingCount > 0;
  const stats = computeScanSummaryStats(state.progress, state.results.length);

  if (willEnrich) {
    const message = formatScanListingCompleteMessage(stats, enrichingCount, {
      stopped,
      batchCity: state.progress.batchCity,
    });
    await mutateState((s) => {
      s.progress.message = message;
      s.progress.status = 'enriching';
      s.progress.enriching = enrichingCount;
    });
    await flushSessionSync();
    await notifyScanListingComplete(message);
    return;
  }

  await finalizeScanFullyComplete({ stopped });
}

async function handleEnrichmentFinished(): Promise<void> {
  const state = await readState();
  if (state.batchScan?.active) {
    void maybeAdvanceBatchScan();
    return;
  }
  await finalizeScanFullyComplete();
}

async function maybeAdvanceBatchScan(): Promise<void> {
  const state = await readState();
  if (!state.batchScan?.active) return;
  if (state.progress.status !== 'complete') return;
  if (enrichQueue.length > 0 || enriching || enrichActiveCount > 0) return;

  const nextIndex = state.batchScan.currentCityIndex + 1;
  if (nextIndex >= state.batchScan.cities.length) {
    await finalizeScanFullyComplete({ batchFinished: true });
    return;
  }

  await sleep(1500);
  await startNextBatchCity(nextIndex);
}

async function finishBatchScanEarly(): Promise<void> {
  await mutateState((s) => {
    if (s.batchScan) s.batchScan.active = false;
  });
}

async function injectAndStart(tabId: number, params: ScanParams): Promise<void> {
  const ready = await waitForContentScript(tabId);
  if (!ready) {
    await mutateState((state) => {
      state.progress.status = 'error';
      state.progress.message = 'Content script failed to load on the scan tab.';
    });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'START_SCAN', params });
  } catch {
    await mutateState((state) => {
      state.progress.status = 'error';
      state.progress.message = 'Failed to start scan on the active tab.';
    });
  }
}

async function queueEnrichment(lead: BusinessLead): Promise<void> {
  if (!lead?.id || !lead.name) return;
  const settings = await readEnrichmentSettings();
  if (!settings.enrichDuringScan) return;
  if (!(await scanEnrichmentAllowed())) return;
  if (enrichQueue.some((item) => item.id === lead.id)) return;
  enrichQueue.push({ ...emptyContactFields(), ...lead, enrichmentStatus: 'pending' });
  enrichActiveCount++;
  void runEnrichmentQueue();
}

async function runEnrichmentQueue(): Promise<void> {
  if (enriching) return;
  enriching = true;

  await mutateState((state) => {
    state.progress.status = state.progress.status === 'complete' ? 'enriching' : state.progress.status;
    state.progress.enriching = enrichActiveCount;
  });

  while (enrichQueue.length > 0 && !stopEnrichment) {
    const lead = enrichQueue.shift();
    if (lead) {
      await enrichLead(lead);
      enrichActiveCount = Math.max(0, enrichActiveCount - 1);
      await mutateState((state) => {
        state.progress.enriching = enrichActiveCount + enrichQueue.length;
        if (enrichActiveCount === 0 && enrichQueue.length === 0 && state.progress.status === 'enriching') {
          state.progress.status = 'complete';
        }
      });
    }
  }

  enriching = false;

  await flushSessionSync();

  if (enrichQueue.length > 0 && !stopEnrichment) {
    void runEnrichmentQueue();
    return;
  }

  const state = await readState();
  if (state.progress.status === 'complete' || state.progress.status === 'enriching') {
    await handleEnrichmentFinished();
  } else {
    void maybeAdvanceBatchScan();
  }
}

async function waitForSearchScript(tabId: number, attempts = 16): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING_SEARCH' });
      if (response?.ok) return true;
    } catch {
      // Search parser not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function openSearchTab(url: string): Promise<number | null> {
  if (searchTabId) {
    try {
      await chrome.tabs.get(searchTabId);
      await chrome.tabs.update(searchTabId, { url, active: false });
      return searchTabId;
    } catch {
      searchTabId = null;
    }
  }

  const tab = await chrome.tabs.create({ url, active: false });
  searchTabId = tab.id ?? null;
  return searchTabId;
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 12000);
  });
}

async function parseCurrentSearch(tabId: number): Promise<SearchParseResult> {
  const ready = await waitForSearchScript(tabId);
  if (!ready) return { links: [], emails: [], text: '', results: [] };
  try {
    const result = (await chrome.tabs.sendMessage(tabId, { type: 'PARSE_SEARCH' })) as SearchParseResult;
    return result ?? { links: [], emails: [], text: '', results: [] };
  } catch {
    return { links: [], emails: [], text: '', results: [] };
  }
}

function applySearchHits(lead: BusinessLead, parsed: SearchParseResult, query: SearchQuery): BusinessLead {
  const next: BusinessLead = { ...emptyContactFields(), ...lead };
  const contextText = parsed.results.map((r) => `${r.title} ${r.snippet}`).join('\n') + parsed.text;

  for (const link of parsed.links) {
    const social = classifySocialUrl(link);
    if (!social) continue;
    if (query.purpose === 'social' && query.platform && social.network !== query.platform) continue;

    const resultItem = parsed.results.find((r) => r.url === link || link.includes(r.url));
    const snippetText = `${resultItem?.title ?? ''} ${resultItem?.snippet ?? ''} ${link}`;

    if (!socialProfileMatchesBusiness(link, snippetText || contextText, lead, social.network)) continue;

    const source = resultItem?.url ?? link;

    if (social.network === 'facebook' && !next.facebook) {
      next.facebook = social.url;
      next.facebookSource = source;
    } else if (social.network === 'instagram' && !next.instagram) {
      next.instagram = social.url;
      next.instagramSource = source;
    } else if (social.network === 'linkedin' && !next.linkedin && /\/company\//i.test(link)) {
      next.linkedin = social.url;
      next.linkedinSource = source;
    } else if (social.network === 'twitter' && !next.twitter) {
      next.twitter = social.url;
      next.twitterSource = source;
    } else if (social.network === 'youtube' && !next.youtube) {
      next.youtube = social.url;
    } else if (social.network === 'tiktok' && !next.tiktok) {
      next.tiktok = social.url;
      next.tiktokSource = source;
    } else if (social.network === 'yelp' && !next.yelp) {
      next.yelp = social.url;
      next.yelpSource = source;
    } else if (social.network === 'yellowpages' && !next.yellowpages) {
      next.yellowpages = social.url;
      next.yellowpagesSource = source;
    } else if (social.network === 'bbb' && !next.bbb) {
      next.bbb = social.url;
      next.bbbSource = source;
    } else if (social.network === 'angi' && !next.angi) {
      next.angi = social.url;
      next.angiSource = source;
    } else if (social.network === 'thumbtack' && !next.thumbtack) {
      next.thumbtack = social.url;
      next.thumbtackSource = source;
    } else if (social.network === 'manta' && !next.manta) {
      next.manta = social.url;
      next.mantaSource = source;
    } else if (social.network === 'foursquare' && !next.foursquare) {
      next.foursquare = social.url;
      next.foursquareSource = source;
    } else if (social.network === 'mapquest' && !next.mapquest) {
      next.mapquest = social.url;
      next.mapquestSource = source;
    }
  }

  if (query.purpose === 'email' || query.purpose === 'social') {
    const candidates: EmailCandidate[] = [];
    let emailSource = next.emailSources;

    for (const email of parsed.emails) {
      if (!isUsefulEmail(email)) continue;
      const item = parsed.results.find((r) => r.snippet.includes(email) || r.title.includes(email));
      const ctx = item ? `${item.title} ${item.snippet}` : contextText;
      const contextMatch = businessMatchesContext(ctx, lead);
      if (query.purpose === 'email' || contextMatch) {
        candidates.push({ address: email, contextMatch });
        if (contextMatch && !emailSource && item?.url) emailSource = item.url;
      }
    }

    const scored = pickBestValidatedEmails(candidates, lead, isUsefulEmail, isBusinessEmail);
    const merged = mergeEmailRecords(normalizeEmailList(next.emails), scored);
    if (merged.length > 0) {
      next.emails = merged;
      if (emailSource) next.emailSources = emailSource;
    }
  }

  if (query.purpose === 'owner' && !next.ownerName) {
    for (const result of parsed.results) {
      const combined = `${result.title}\n${result.snippet}`;
      if (!businessMatchesContext(combined, lead)) continue;
      const owner = extractOwnerInfo(combined, lead);
      if (owner) {
        next.ownerName = owner.name;
        next.ownerTitle = owner.title;
        next.ownerLinkedIn = owner.linkedIn;
        next.ownerSource = result.url;
        break;
      }
    }
  }

  return next;
}

function enrichmentComplete(lead: BusinessLead): boolean {
  const hasSocial = Boolean(
    lead.facebook ||
      lead.instagram ||
      lead.linkedin ||
      lead.yelp ||
      lead.yellowpages ||
      lead.bbb ||
      lead.angi ||
      lead.thumbtack ||
      lead.manta ||
      lead.foursquare ||
      lead.mapquest
  );
  const hasEmail = (lead.emails ?? []).length > 0;
  const hasOwner = Boolean(lead.ownerName);
  return hasSocial && (hasEmail || hasOwner);
}

async function runSingleSearchQuery(
  query: SearchQuery,
  settings: EnrichmentSettings,
  reuseTab: boolean
): Promise<SearchParseResult> {
  const url = searchUrl(query.query);
  let tabId: number | null = null;
  let createdTab = false;

  if (reuseTab) {
    tabId = await openSearchTab(url);
  } else {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id ?? null;
    createdTab = true;
  }

  if (!tabId) return EMPTY_SEARCH_PARSE;

  try {
    await waitForTabLoad(tabId);
    await sleep(settings.searchDelayMs);
    return await parseCurrentSearch(tabId);
  } finally {
    if (createdTab) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

async function enrichLeadData(
  lead: BusinessLead,
  onProgress?: (lead: BusinessLead) => void
): Promise<BusinessLead> {
  const settings = await readEnrichmentSettings();
  const userState = await getCachedUserState();
  const plan = userState.profile?.plan ?? 'free';

  let current: BusinessLead = { ...emptyContactFields(), ...lead, enrichmentStatus: 'pending' };
  const queries = buildSearchQueries(
    lead.name,
    searchLocation || lead.address,
    searchCategory || lead.category,
    settings.platforms,
    plan
  );

  if (queries.length === 0) {
    current.enrichmentStatus = 'partial';
    onProgress?.(current);
    return current;
  }

  const concurrency = settings.maxConcurrentSearches;
  const reuseTab = concurrency <= 1;

  for (let i = 0; i < queries.length; i += concurrency) {
    if (stopEnrichment) break;
    if (enrichmentComplete(current)) break;

    const batch = queries.slice(i, i + concurrency);
    const parsedBatch = await Promise.all(
      batch.map((query) => runSingleSearchQuery(query, settings, reuseTab))
    );

    for (let j = 0; j < batch.length; j++) {
      current = applySearchHits(current, parsedBatch[j], batch[j]);
    }

    current.enrichmentStatus = enrichmentComplete(current) ? 'done' : 'partial';
    onProgress?.(current);
  }

  current.enrichmentStatus =
    enrichmentComplete(current) ? 'done' : current.enrichmentStatus === 'pending' ? 'partial' : current.enrichmentStatus;

  if (current.emails.length > 0) {
    current.emails = await enrichEmailsWithMx(current.emails);
  }

  onProgress?.(current);
  return current;
}

async function enrichLead(lead: BusinessLead): Promise<void> {
  const settings = await readEnrichmentSettings();
  if (!settings.enrichDuringScan) return;

  await enrichLeadData(lead, (partial) => {
    void mutateState((state) => {
      mergeLeads(state, [partial]);
    });
  });
}

function queueAuditEnrichment(lead: BusinessLead): void {
  if (!lead?.id || !lead.name) return;

  void (async () => {
    const settings = await readEnrichmentSettings();
    if (!settings.enrichAfterGbpAudit) return;
    const { capabilities } = await getActivePlanContext();
    if (!capabilities.auditEnrichmentEnabled) return;

    const state = await readState();
    const persist: AuditEnrichJob['persist'] = state.results.some((item) => item.id === lead.id)
      ? 'scan'
      : 'standalone';

    if (auditEnrichQueue.some((job) => job.placeId === lead.id)) return;

    auditEnrichQueue.push({ lead, persist, placeId: lead.id });
    void runAuditEnrichmentQueue();
  })();
}

async function runAuditEnrichmentQueue(): Promise<void> {
  if (auditEnriching) return;
  auditEnriching = true;

  while (auditEnrichQueue.length > 0) {
    const job = auditEnrichQueue.shift();
    if (!job) continue;

    const settings = await readEnrichmentSettings();
    if (!settings.enrichAfterGbpAudit) continue;

    const enriched = await enrichLeadData(job.lead);

    if (job.persist === 'scan') {
      await mutateState((state) => {
        const existing = state.results.find((item) => item.id === job.placeId);
        mergeLeads(state, [
          {
            ...(existing ?? job.lead),
            ...enriched,
            gbpAudit: existing?.gbpAudit ?? job.lead.gbpAudit,
          },
        ]);
      });
      await flushSessionSync();
    } else {
      const entry = await getStandaloneEntry(job.placeId);
      if (entry) {
        await upsertStandaloneEntry({
          ...entry,
          emails: enriched.emails,
          facebook: enriched.facebook,
          instagram: enriched.instagram,
          linkedin: enriched.linkedin,
          twitter: enriched.twitter,
          youtube: enriched.youtube,
          tiktok: enriched.tiktok,
          yelp: enriched.yelp,
          yellowpages: enriched.yellowpages,
          bbb: enriched.bbb,
          angi: enriched.angi,
          thumbtack: enriched.thumbtack,
          manta: enriched.manta,
          foursquare: enriched.foursquare,
          mapquest: enriched.mapquest,
          otherSocial: enriched.otherSocial,
          ownerName: enriched.ownerName,
          ownerTitle: enriched.ownerTitle,
          ownerLinkedIn: enriched.ownerLinkedIn,
          ownerSource: enriched.ownerSource,
          facebookSource: enriched.facebookSource,
          instagramSource: enriched.instagramSource,
          linkedinSource: enriched.linkedinSource,
          twitterSource: enriched.twitterSource,
          tiktokSource: enriched.tiktokSource,
          yelpSource: enriched.yelpSource,
          yellowpagesSource: enriched.yellowpagesSource,
          bbbSource: enriched.bbbSource,
          angiSource: enriched.angiSource,
          thumbtackSource: enriched.thumbtackSource,
          mantaSource: enriched.mantaSource,
          foursquareSource: enriched.foursquareSource,
          mapquestSource: enriched.mapquestSource,
          emailSources: enriched.emailSources,
          enrichmentStatus: enriched.enrichmentStatus,
        });
      }
    }
  }

  auditEnriching = false;

  if (auditEnrichQueue.length > 0) {
    void runAuditEnrichmentQueue();
  }
}

setAuditEnrichmentHandler(queueAuditEnrichment);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case 'START_SCAN': {
        const planCtx = await getActivePlanContext();
        if (!planCtx.signedIn) {
          sendResponse({ ok: false, error: 'Sign in to run scans. Open Settings → Account.' });
          break;
        }
        const params = message.params as ScanParams;
        const capped: ScanParams = {
          ...params,
          count: clampScanCount(params.count, planCtx.capabilities.maxResultsPerScan),
        };
        const quotaResult = await consumeScanQuota();
        if (!quotaResult.allowed) {
          sendResponse({ ok: false, error: quotaResult.message });
          break;
        }
        await startScan(capped);
        logActivity('scan_started', { niche: capped.niche, location: capped.location, count: capped.count });
        sendResponse({ ok: true });
        break;
      }

      case 'START_BATCH_SCAN': {
        const planCtx = await getActivePlanContext();
        if (!planCtx.signedIn) {
          sendResponse({ ok: false, error: 'Sign in to run scans. Open Settings → Account.' });
          break;
        }
        if (planCtx.capabilities.batchMaxCities <= 0) {
          sendResponse({ ok: false, error: upgradeMessage('Multi-city batch scans') });
          break;
        }
        const cities = parseCityList(message.citiesText as string);
        if (cities.length > planCtx.capabilities.batchMaxCities) {
          sendResponse({
            ok: false,
            error: `Your ${planCtx.plan} plan allows up to ${planCtx.capabilities.batchMaxCities} cities per batch.`,
          });
          break;
        }
        const quotaResult = await consumeScanQuota();
        if (!quotaResult.allowed) {
          sendResponse({ ok: false, error: quotaResult.message });
          break;
        }
        const countPerCity = clampScanCount(
          message.countPerCity as number,
          planCtx.capabilities.maxResultsPerScan
        );
        await startBatchScan(
          message.niche as string,
          message.citiesText as string,
          countPerCity
        );
        logActivity('batch_scan_started', {
          niche: message.niche,
          cities: cities.length,
          count_per_city: countPerCity,
        });
        sendResponse({ ok: true });
        break;
      }

      case 'STOP_SCAN':
        if (activeTabId) {
          try {
            await chrome.tabs.sendMessage(activeTabId, { type: 'STOP_SCAN' });
          } catch {
            // Tab may be closed
          }
        }
        stopEnrichment = true;
        enrichQueue = [];
        enrichActiveCount = 0;
        await finishBatchScanEarly();
        await mutateState((state) => {
          if (state.progress.status === 'scanning' || state.progress.status === 'paused' || state.progress.status === 'enriching') {
            state.progress.status = 'complete';
            state.progress.enriching = 0;
          }
        });
        await flushSessionSync();
        await finalizeScanFullyComplete({ stopped: true });
        sendResponse({ ok: true });
        break;

      case 'PAUSE_SCAN':
        if (activeTabId) {
          try {
            await chrome.tabs.sendMessage(activeTabId, { type: 'PAUSE_SCAN' });
          } catch {
            // Tab may be closed
          }
        }
        await mutateState((state) => {
          if (state.progress.status === 'scanning') state.progress.status = 'paused';
        });
        sendResponse({ ok: true });
        break;

      case 'RESUME_SCAN':
        if (activeTabId) {
          try {
            await chrome.tabs.sendMessage(activeTabId, { type: 'RESUME_SCAN' });
          } catch {
            // Tab may be closed
          }
        }
        await mutateState((state) => {
          if (state.progress.status === 'paused') state.progress.status = 'scanning';
        });
        sendResponse({ ok: true });
        break;

      case 'OPEN_RESULTS':
        await openResultsPage();
        sendResponse({ ok: true });
        break;

      case 'OPEN_AUDIT':
        await openAuditPage(message.leadId as string);
        sendResponse({ ok: true });
        break;

      case 'AUDIT_GBP': {
        const quotaResult = await consumeAuditQuota();
        if (!quotaResult.allowed) {
          sendResponse({ ok: false, error: quotaResult.message });
          break;
        }
        queueGbpAudit(message.leadId as string, message.openWhenDone === true);
        sendResponse({ ok: true });
        break;
      }

      case 'GET_AUDIT_QUEUE':
        sendResponse({ queue: getAuditQueueSnapshot() });
        break;

      case 'SET_AUDIT_OPEN_WHEN_DONE':
        setAuditQueueOpenWhenDone(
          message.key as string,
          message.kind as 'scan' | 'standalone',
          message.openWhenDone === true
        );
        sendResponse({ ok: true });
        break;

      case 'OPEN_AUDIT_REPORT':
        if (message.kind === 'standalone') {
          await openStandaloneAuditPage(message.key as string);
        } else {
          await openAuditPage(message.key as string);
        }
        sendResponse({ ok: true });
        break;

      case 'REFRESH_STANDALONE_AUDIT': {
        const placeId = message.placeId as string;
        const entry = await getStandaloneEntry(placeId);
        if (entry) {
          queueStandaloneGbpAudit(
            {
              placeId: entry.placeId,
              name: entry.name,
              mapsUrl: entry.mapsUrl,
              category: entry.audit.snapshot.primaryCategory ?? undefined,
              address: entry.audit.snapshot.address ?? undefined,
              phone: entry.audit.snapshot.phone ?? undefined,
              rating:
                entry.audit.snapshot.rating != null
                  ? String(entry.audit.snapshot.rating)
                  : undefined,
              reviews:
                entry.audit.snapshot.reviewCount != null
                  ? String(entry.audit.snapshot.reviewCount)
                  : undefined,
            },
            false
          );
        }
        sendResponse({ ok: Boolean(entry) });
        break;
      }

      case 'STANDALONE_GBP_AUDIT': {
        const quotaResult = await consumeAuditQuota();
        if (!quotaResult.allowed) {
          sendResponse({ ok: false, error: quotaResult.message });
          break;
        }
        const started = queueStandaloneGbpAudit(
          message.request as StandaloneGbpAuditRequest,
          message.openWhenDone === true,
          sender.tab?.id
        );
        sendResponse({ ok: started });
        break;
      }

      case 'DEEP_SCAN_AUDIT_PLACE': {
        const snapshot = await scrapePlaceForDeepScan(
          message.request as StandaloneGbpAuditRequest
        );
        sendResponse({ ok: Boolean(snapshot), snapshot: snapshot ?? null });
        break;
      }

      case 'PARALLEL_DEEP_SCAN_AUDIT_PLACE': {
        // Parallel deep scan - scrape using worker's dedicated tab
        const { handleWorkerScrape } = await import('./parallel-audit-handler');
        const snapshot = await handleWorkerScrape(
          message.request as StandaloneGbpAuditRequest,
          message.workerId as number
        );
        sendResponse({ ok: Boolean(snapshot), snapshot: snapshot ?? null });
        break;
      }

      case 'PARALLEL_DEEP_SCAN_INIT': {
        // Initialize parallel audit tab pool
        const { handleInitializePool } = await import('./parallel-audit-handler');
        await handleInitializePool(message.workerCount as number);
        sendResponse({ ok: true });
        break;
      }

      case 'PARALLEL_DEEP_SCAN_CLEANUP': {
        // Cleanup parallel audit tabs
        const { handleCleanupPool } = await import('./parallel-audit-handler');
        await handleCleanupPool();
        sendResponse({ ok: true });
        break;
      }

      case 'HARVEST_SEARCH_PROFILE': {
        const name = String(message.name ?? '');
        const address = String(message.address ?? '');
        const kgMid = typeof message.kgMid === 'string' && message.kgMid.trim() ? message.kgMid.trim() : null;
        const fields = await harvestSearchProfileFields(name, address, kgMid);
        sendResponse({
          ok: Boolean(fields),
          services: fields?.services ?? [],
          serviceAreas: fields?.serviceAreas ?? [],
        });
        break;
      }

      case 'FETCH_DOMAIN_AGE': {
        // Fetch domain age for SERP enhancement
        const { getDomainAge } = await import('../enrichment/domain-age');
        const domainAge = await getDomainAge(message.domain as string);
        sendResponse({ domainAge });
        break;
      }

      case 'OPEN_STANDALONE_AUDIT':
        await openStandaloneAuditPage(message.placeId as string);
        sendResponse({ ok: true });
        break;

      case 'GET_GBP_AUDIT_STORE':
        sendResponse({ store: await readGbpAuditStore() });
        break;

      case 'GET_GBP_AUDIT_ENTRY':
        sendResponse({ entry: await getStandaloneEntry(message.placeId as string) });
        break;

      case 'LIST_GBP_AUDIT_HISTORY':
        sendResponse({ history: await listAuditHistory() });
        break;

      case 'GET_GBP_AUDIT_HISTORY': {
        const entry = await getAuditHistoryById(message.auditId as string);
        sendResponse({ entry });
        break;
      }

      case 'DELETE_GBP_AUDIT_HISTORY':
        sendResponse({ ok: await deleteAuditHistory(message.auditId as string) });
        break;

      case 'GET_STATE':
        sendResponse({ state: await readState() });
        break;

      case 'LIST_SCAN_SESSIONS':
        sendResponse({
          store: (await userHasPersistentHistory())
            ? await readScanSessionStore()
            : emptyScanSessionStore(),
        });
        break;

      case 'GET_SCAN_SESSION': {
        if (!(await userHasPersistentHistory())) {
          sendResponse({ session: null });
          break;
        }
        const store = await readScanSessionStore();
        const session = store.sessions.find((s) => s.id === message.sessionId) ?? null;
        sendResponse({ session });
        break;
      }

      case 'LOAD_SCAN_SESSION': {
        if (!(await userHasPersistentHistory())) {
          sendResponse({
            ok: false,
            error: 'Scan history is not available on the free plan. Upgrade to Lifetime to save and reopen scans.',
          });
          break;
        }
        const sessionState = await loadSessionIntoState(message.sessionId as string);
        if (sessionState) {
          await enqueue(async () => {
            await chrome.storage.local.set({ [STORAGE_KEY]: sessionState });
            chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: sessionState }).catch(() => {});
          });
          await openResultsPage();
        }
        sendResponse({ ok: Boolean(sessionState) });
        break;
      }

      case 'DELETE_SCAN_SESSION':
        await deleteScanSession(message.sessionId as string);
        sendResponse({ ok: true });
        break;

      case 'CHECK_RANK': {
        const result = await checkRank(message.request as RankCheckRequest);
        sendResponse(result);
        break;
      }

      case 'LOCATE_BUSINESS': {
        const location = await locateBusiness(
          message.query as { name: string; address?: string; placeId?: string }
        );
        sendResponse(location);
        break;
      }

      case 'OPEN_RANK_CHECK': {
        const params = message.params as {
          name: string;
          address: string;
          keyword: string;
          placeId: string;
          lat?: string;
          lng?: string;
        };
        const urlParams = new URLSearchParams(params as Record<string, string>);
        const url = chrome.runtime.getURL(`src/rank-check/index.html?${urlParams.toString()}`);
        await chrome.tabs.create({ url, active: true });
        sendResponse({ ok: true });
        break;
      }

      case 'RENAME_SCAN_SESSION': {
        const ok = await renameScanSession(message.sessionId as string, message.name as string);
        sendResponse({ ok });
        break;
      }

      case 'OPEN_DASHBOARD': {
        const tab = parseDashboardTab(typeof message.tab === 'string' ? message.tab : null);
        await chrome.tabs.create({ url: dashboardPageUrl(tab), active: true });
        sendResponse({ ok: true });
        break;
      }

      case 'OPEN_HISTORY': {
        await chrome.tabs.create({ url: dashboardPageUrl('history'), active: true });
        sendResponse({ ok: true });
        break;
      }

      case 'OPEN_SETTINGS': {
        await chrome.tabs.create({ url: dashboardPageUrl('settings'), active: true });
        sendResponse({ ok: true });
        break;
      }

      case 'CHECK_QUICK_SCAN_QUOTA': {
        if (!isSupabaseConfigured()) {
          sendResponse({ ok: true });
          break;
        }
        await refreshUserState();
        const check = await checkQuickScanQuota();
        sendResponse({ ok: check.allowed, error: check.allowed ? undefined : check.message });
        break;
      }

      case 'CHECK_DEEP_SCAN_QUOTA': {
        const count = Math.max(0, Math.floor(Number(message.count) || 0));
        if (count <= 0) {
          sendResponse({ ok: false, error: 'No listings to deep scan.' });
          break;
        }
        if (!isSupabaseConfigured()) {
          sendResponse({ ok: true });
          break;
        }
        await refreshUserState();
        const check = await checkDeepScanQuota(count);
        sendResponse({
          ok: check.allowed,
          error: check.allowed ? undefined : check.message,
          maxDeepScans: check.maxDeepScans,
          skipped: check.skipped,
          notice: check.skipped > 0 ? check.message : undefined,
        });
        break;
      }

      case 'LOCAL_SCAN_COMPLETE': {
        const session = message.session as LocalScanSession;
        if (!session?.id || !Array.isArray(session.businesses)) {
          sendResponse({ ok: false });
          break;
        }

        if (session.mode === 'deep' && isSupabaseConfigured()) {
          const deepCount = session.businesses.filter((b) => b.deepScraped).length;
          if (deepCount > 0) {
            const quota = await consumeDeepScanQuota(deepCount);
            if (!quota.allowed) {
              sendResponse({ ok: false, error: quota.message });
              break;
            }
          }
        } else if (
          session.mode === 'quick' &&
          !session.fromCache &&
          isSupabaseConfigured()
        ) {
          const quota = await consumeQuickScanQuota();
          if (!quota.allowed) {
            sendResponse({ ok: false, error: quota.message });
            break;
          }
        }

        const search3Pack = await fetchSearch3Pack(session.context.keyword);
        const enriched: LocalScanSession = {
          ...session,
          search3Pack: search3Pack.length > 0 ? search3Pack : session.search3Pack,
        };
        await saveLocalScanSession(enriched);
        if (enriched.mode === 'quick') {
          const cacheKey = buildScanCacheKey(
            enriched.context.keyword,
            enriched.context.searchCenterLat,
            enriched.context.searchCenterLng,
            'quick'
          );
          await saveScanCache(cacheKey, enriched);
        }

        // Partial deep scan (quota limit): auto-open report for deep-scraped profiles only.
        const deepScrapedCount = enriched.businesses.filter((b) => b.deepScraped).length;
        const isPartialDeepScan =
          enriched.mode === 'deep' &&
          deepScrapedCount > 0 &&
          deepScrapedCount < enriched.businesses.length;

        await openLocalScanPage(enriched.id, { deepOnly: isPartialDeepScan });
        logActivity(enriched.mode === 'deep' ? 'deep_scan' : 'local_scan', {
          mode: enriched.mode,
          businesses: enriched.businesses.length,
          keyword: enriched.context.keyword,
        });
        sendResponse({ ok: true, sessionId: enriched.id });
        break;
      }

      case 'LIST_LOCAL_SCANS': {
        const sessions = (await userHasPersistentHistory()) ? await listLocalScanSessions() : [];
        sendResponse({ sessions });
        break;
      }

      case 'DELETE_LOCAL_SCAN': {
        const ok = await deleteLocalScanSession(message.sessionId as string);
        sendResponse({ ok });
        break;
      }

      case 'LOCAL_SCAN_UPDATE': {
        const session = message.session as LocalScanSession;
        if (!session?.id) {
          sendResponse({ ok: false });
          break;
        }
        await saveLocalScanSession(session);
        sendResponse({ ok: true });
        break;
      }

      case 'FETCH_SEARCH_3PACK': {
        const keyword = String(message.keyword ?? '');
        const entries = keyword ? await fetchSearch3Pack(keyword) : [];
        sendResponse({ entries });
        break;
      }

      case 'GET_LOCAL_SCAN': {
        const session = await getLocalScanSession(message.sessionId as string);
        sendResponse({ session });
        break;
      }

      case 'OPEN_LOCAL_SCAN': {
        await openLocalScanPage(message.sessionId as string);
        sendResponse({ ok: true });
        break;
      }

      case 'OPEN_LOCAL_SCAN_LATEST': {
        if (!(await userHasPersistentHistory())) {
          sendResponse({
            ok: false,
            error: 'Local Scan history is not available on the free plan. Upgrade to Lifetime to save and reopen reports.',
          });
          break;
        }
        const latest = await getLatestLocalScanSession();
        if (latest) {
          await openLocalScanPage(latest.id);
        } else {
          await chrome.tabs.create({ url: localScanHistoryUrl(), active: true });
        }
        sendResponse({ ok: true });
        break;
      }

      case 'OPEN_LOCAL_SCAN_HISTORY': {
        await chrome.tabs.create({ url: localScanHistoryUrl(), active: true });
        sendResponse({ ok: true });
        break;
      }

      case 'GET_ENRICHMENT_SETTINGS':
        sendResponse({ settings: await readEnrichmentSettings() });
        break;

      case 'SET_ENRICHMENT_SETTINGS': {
        const settings = normalizeEnrichmentSettings(message.settings);
        await writeEnrichmentSettings(settings);
        sendResponse({ ok: true, settings });
        break;
      }

      case 'GET_WHITE_LABEL_SETTINGS':
        sendResponse({ settings: await readWhiteLabelSettings() });
        break;

      case 'SET_WHITE_LABEL_SETTINGS': {
        const settings = normalizeWhiteLabelSettings(message.settings);
        await writeWhiteLabelSettings(settings);
        sendResponse({ ok: true, settings });
        break;
      }

      case 'SCAN_PROGRESS': {
        const progress = message.progress as ScanProgress;
        await mutateState((state) => {
          state.progress = {
            ...progress,
            withoutWebsite: state.results.length,
            enriching: enrichActiveCount + enrichQueue.length,
          };
          applyBatchProgressMeta(state);
        });
        sendResponse({ ok: true });
        break;
      }

      case 'SCAN_RESULT':
        await mutateState((state) => {
          const city = state.params?.location ?? '';
          const business = tagLeadWithScanCity(message.business as BusinessLead, city);
          mergeLeads(state, [business]);
        });
        void queueEnrichment(message.business as BusinessLead);
        sendResponse({ ok: true });
        break;

      case 'SCAN_COMPLETE': {
        const extra = (message.results as BusinessLead[] | undefined) ?? [];
        const progress = message.progress as ScanProgress;
        await mutateState((state) => {
          const city = state.params?.location ?? '';
          const tagged = extra.map((lead) => tagLeadWithScanCity(lead, city));
          mergeLeads(state, tagged);
          state.progress = {
            ...progress,
            status: 'complete',
            withoutWebsite: state.results.length,
            enriching: enrichActiveCount + enrichQueue.length,
          };
          applyBatchProgressMeta(state);
        });
        await flushSessionSync();
        for (const lead of extra) {
          await queueEnrichment(lead);
        }
        await handleListingScanFinished(false);
        sendResponse({ ok: true });
        break;
      }

      case 'SCAN_ERROR':
        await mutateState((state) => {
          state.progress.message = message.message as string;
          if (state.batchScan?.active) {
            state.progress.status = 'complete';
          } else {
            state.progress.status = 'error';
          }
        });
        await flushSessionSync();
        void maybeAdvanceBatchScan();
        sendResponse({ ok: true });
        break;

      // ─────────────────────────────────────────────────────────────────────
      // Auth / Supabase messages
      // ─────────────────────────────────────────────────────────────────────

      case 'AUTH_GET_USER': {
        const user = await getCurrentUser();
        sendResponse({ ok: true, user });
        break;
      }

      case 'AUTH_GET_STATE': {
        const state = await getCachedUserState();
        sendResponse({ ok: true, state });
        break;
      }

      case 'AUTH_REFRESH_STATE': {
        const state = await refreshUserState();
        sendResponse({ ok: true, state });
        break;
      }

      case 'AUTH_SIGN_IN': {
        const { user, error } = await signInWithEmail(
          message.email as string,
          message.password as string
        );
        sendResponse({ ok: !error, user, error: error?.message });
        break;
      }

      case 'AUTH_SIGN_UP': {
        const { user, error } = await signUpWithEmail(
          message.email as string,
          message.password as string
        );
        sendResponse({ ok: !error, user, error: error?.message });
        break;
      }

      case 'AUTH_SIGN_OUT': {
        const { error } = await signOut();
        sendResponse({ ok: !error, error: error?.message });
        break;
      }

      case 'AUTH_RESET_PASSWORD': {
        const { error } = await resetPassword(message.email as string);
        sendResponse({ ok: !error, error: error?.message });
        break;
      }

      case 'AUTH_SIGN_IN_GOOGLE': {
        const { user, error } = await signInWithGoogle();
        sendResponse({ ok: !error, user, error });
        break;
      }

      case 'GET_SUPABASE_STATUS':
        sendResponse({
          ok: true,
          configured: isSupabaseConfigured(),
          googleConfigured: isGoogleAuthConfigured(),
        });
        break;

      default:
        sendResponse({ ok: false });
    }
  })();

  return true;
});

void (async () => {
  try {
    const user = await getCurrentUser();
    await syncHistoryScopeWithAuth(user?.id ?? null);
  } catch {
    // Ignore startup scope sync errors
  }
})();

// Clean up temporary session data for free users on browser startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    const keys = await chrome.storage.local.get(null);
    const tempKeys = Object.keys(keys).filter(key => 
      key.includes(':session_temp')
    );
    
    if (tempKeys.length > 0) {
      await chrome.storage.local.remove(tempKeys);
      console.log('[Cleanup] Cleared', tempKeys.length, 'temporary session data keys');
    }
  } catch (err) {
    console.error('[Cleanup] Error clearing temp data:', err);
  }
});

// Create anonymous user on extension install for free tier usage tracking
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[Install] Extension installed, creating anonymous user...');
    const created = await ensureAnonymousUser();
    if (created) {
      console.log('[Install] Anonymous user created successfully');
    } else {
      console.log('[Install] Anonymous user creation skipped or failed');
    }
  } else if (details.reason === 'update') {
    console.log('[Install] Extension updated from', details.previousVersion);
    // On update, check if user needs anonymous account
    try {
      const user = await getCurrentUser();
      if (!user) {
        console.log('[Install] No user found after update, creating anonymous account');
        await ensureAnonymousUser();
      }
    } catch (err) {
      console.error('[Install] Error checking user on update:', err);
    }
  }
});

export {};
