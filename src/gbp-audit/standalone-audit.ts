import { buildGbpAudit, mergeLeadIntoSnapshot } from '../audit/scoring';

import { emptyGbpAudit } from '../audit/types';

import type { GbpProfileSnapshot } from '../audit/types';

import { emptyContactFields, normalizeBusinessLead, type BusinessLead } from '../types';

import { prepareAuditTabAndScrape } from './audit-tab';
import { isAuditablePlaceUrl, normalizeMapsAuditUrl } from './maps-url';
import { normalizeStandalonePlaceId } from './place-id';
import { closeHarvestTab, harvestSearchProfileFields } from './search-profile-harvest';
import { triggerAuditEnrichment } from './audit-enrichment-hook';
import { getStandaloneEntry, upsertStandaloneEntry, appendAuditHistory } from './store';
import type { StandaloneGbpAuditRequest } from './types';
import {
  enqueueAuditQueueItem,
  markAuditQueueFinished,
  markAuditQueueRunning,
} from './audit-queue-state';
import { handleAuditQueueItemComplete } from './audit-notifications';

let standaloneAuditTabId: number | null = null;
let deepScanAuditTabId: number | null = null;

let standaloneAuditQueue: Array<{
  request: StandaloneGbpAuditRequest;
  sourceTabId?: number;
  openWhenDone: boolean;
}> = [];

let standaloneAuditing = false;



function stubLeadFromRequest(req: StandaloneGbpAuditRequest): BusinessLead {

  return normalizeBusinessLead({

    id: req.placeId,

    name: req.name,

    mapsUrl: normalizeMapsAuditUrl(req.mapsUrl, req.placeId),

    category: req.category ?? '',

    address: req.address ?? '',

    phone: req.phone ?? '',

    rating: req.rating ?? '',

    reviews: req.reviews ?? '',

    mapsRank: null,

    hasWebsite: false,

    ...emptyContactFields(),

  });

}



export { openStandaloneAuditPage, standaloneAuditPageUrl } from './open-audit';

async function ensureStandaloneAuditTab(mapsUrl: string): Promise<number | null> {

  const target = mapsUrl.startsWith('http')

    ? mapsUrl

    : `https://www.google.com${mapsUrl.startsWith('/') ? '' : '/'}${mapsUrl}`;

  if (!target) return null;



  if (standaloneAuditTabId) {

    try {

      await chrome.tabs.get(standaloneAuditTabId);

      await chrome.tabs.update(standaloneAuditTabId, { url: target, active: false });

      return standaloneAuditTabId;

    } catch {

      standaloneAuditTabId = null;

    }

  }



  const tab = await chrome.tabs.create({ url: target, active: false });

  standaloneAuditTabId = tab.id ?? null;

  return standaloneAuditTabId;

}



function notifyAuditDone(
  placeId: string,
  score: number | null,
  status: string,
  sourceTabId?: number,
  auditedAt?: string
): void {
  const payload = { type: 'STANDALONE_GBP_AUDIT_DONE', placeId, score, status, auditedAt };

  if (sourceTabId) {

    chrome.tabs.sendMessage(sourceTabId, payload).catch(() => {});

  }

  chrome.runtime.sendMessage(payload).catch(() => {});

}



function snapshotHasCoreData(snapshot: Partial<GbpProfileSnapshot> | null | undefined): boolean {

  if (!snapshot?.name) return false;

  let signals = 0;

  if (snapshot.hasWebsite && snapshot.website) signals++;

  if (snapshot.address && snapshot.address.length > 12) signals++;

  if (snapshot.hours) signals++;

  if (snapshot.phone) signals++;

  if (snapshot.plusCode) signals++;

  if ((snapshot.attributes?.length ?? 0) > 0) signals++;

  if (snapshot.primaryCategory) signals++;

  return signals >= 1;

}



export function queueStandaloneGbpAudit(
  request: StandaloneGbpAuditRequest,
  openWhenDone = false,
  sourceTabId?: number
): boolean {
  const cleanPlaceId = normalizeStandalonePlaceId(request.placeId);
  if (!cleanPlaceId) {
    notifyAuditDone(request.placeId, null, 'error', sourceTabId);
    return false;
  }

  const mapsUrl = normalizeMapsAuditUrl(request.mapsUrl, cleanPlaceId);
  const normalized = { ...request, placeId: cleanPlaceId, mapsUrl };
  if (!mapsUrl) {
    notifyAuditDone(cleanPlaceId, null, 'error', sourceTabId);
    return false;
  }

  const alreadyQueued = standaloneAuditQueue.some((item) => item.request.placeId === normalized.placeId);
  if (alreadyQueued) {
    notifyAuditDone(cleanPlaceId, null, 'running', sourceTabId);
    return true;
  }

  enqueueAuditQueueItem({
    key: normalized.placeId,
    kind: 'standalone',
    name: normalized.name,
    openWhenDone,
  });

  standaloneAuditQueue.push({ request: normalized, sourceTabId, openWhenDone });
  void runStandaloneAuditQueue();
  return true;
}

let auditTabLock: Promise<void> = Promise.resolve();

/** Serialise access to the single shared audit tab. */
function withAuditTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = auditTabLock.then(fn, fn);
  auditTabLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Scrape a place through the dedicated /maps/place audit tab — the exact flow the
 * GBP Audit button uses. The search-results side panel renders hours differently
 * from a standalone place page, so deep scan falls back to this when it comes up
 * empty.
 */
async function ensureDeepScanAuditTab(mapsUrl: string): Promise<number | null> {
  const target = mapsUrl.startsWith('http')
    ? mapsUrl
    : `https://www.google.com${mapsUrl.startsWith('/') ? '' : '/'}${mapsUrl}`;
  if (!target) return null;

  if (deepScanAuditTabId !== null) {
    try {
      await chrome.tabs.get(deepScanAuditTabId);
      await chrome.tabs.update(deepScanAuditTabId, { url: target, active: false });
      return deepScanAuditTabId;
    } catch {
      deepScanAuditTabId = null;
    }
  }

  const tab = await chrome.tabs.create({ url: target, active: false });
  deepScanAuditTabId = tab.id ?? null;
  return deepScanAuditTabId;
}

export async function scrapePlaceInAuditTab(
  request: StandaloneGbpAuditRequest
): Promise<Partial<GbpProfileSnapshot> | null> {
  const cleanPlaceId = normalizeStandalonePlaceId(request.placeId) ?? request.placeId;
  const mapsUrl = normalizeMapsAuditUrl(request.mapsUrl, cleanPlaceId);
  if (!mapsUrl || !isAuditablePlaceUrl(mapsUrl)) return null;

  return withAuditTabLock(async () => {
    // Never fight the standalone audit queue for the shared tab.
    for (let i = 0; i < 60 && standaloneAuditing; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const lead = stubLeadFromRequest({ ...request, placeId: cleanPlaceId, mapsUrl });
    const tabId = await ensureStandaloneAuditTab(lead.mapsUrl);
    if (!tabId) return null;

    const { snapshot } = await prepareAuditTabAndScrape(tabId, lead);
    return snapshot;
  });
}

/**
 * Deep Scan place-page scrape — uses its own background tab so it never races the
 * GBP Audit button tab or waits behind the standalone audit queue.
 * Uses the same approach as regular GBP audit (no tab activation needed).
 */
export async function scrapePlaceForDeepScan(
  request: StandaloneGbpAuditRequest
): Promise<Partial<GbpProfileSnapshot> | null> {
  const cleanPlaceId = normalizeStandalonePlaceId(request.placeId) ?? request.placeId;
  const mapsUrl = normalizeMapsAuditUrl(request.mapsUrl, cleanPlaceId);
  if (!mapsUrl || !isAuditablePlaceUrl(mapsUrl)) return null;

  const lead = stubLeadFromRequest({ ...request, placeId: cleanPlaceId, mapsUrl });
  const tabId = await ensureDeepScanAuditTab(lead.mapsUrl);
  if (!tabId) return null;

  // Scrape in background tab (same as regular GBP audit - no activation needed)
  let result = await prepareAuditTabAndScrape(tabId, lead);
  let snapshot = result.snapshot;

  // Retry once if hours are missing
  if (!snapshot?.hours?.trim()) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    result = await prepareAuditTabAndScrape(tabId, lead);
    snapshot = result.snapshot ?? snapshot;
  }

  return snapshot;
}

export async function runStandaloneAuditQueue(): Promise<void> {
  if (standaloneAuditing) return;
  standaloneAuditing = true;

  while (standaloneAuditQueue.length > 0) {
    const item = standaloneAuditQueue.shift();
    if (item) {
      await runStandaloneGbpAudit(item.request, item.openWhenDone, item.sourceTabId);
    }
  }

  standaloneAuditing = false;
  void closeHarvestTab();
  if (standaloneAuditQueue.length > 0) void runStandaloneAuditQueue();
}

async function runStandaloneGbpAudit(
  request: StandaloneGbpAuditRequest,
  openWhenDone: boolean,
  sourceTabId?: number
): Promise<void> {
  markAuditQueueRunning(request.placeId, 'standalone');
  const lead = stubLeadFromRequest(request);

  const runningAudit = {

    ...emptyGbpAudit(),

    status: 'running' as const,

    auditedAt: new Date().toISOString(),

  };



  await upsertStandaloneEntry({

    placeId: request.placeId,

    name: request.name,

    mapsUrl: lead.mapsUrl,

    audit: runningAudit,

    auditedAt: runningAudit.auditedAt,

    ...emptyContactFields(),

  });



  notifyAuditDone(request.placeId, null, 'running', sourceTabId);



  let snapshotPartial: Partial<GbpProfileSnapshot> | null = null;

  let errorMessage = '';



  const tabId = await ensureStandaloneAuditTab(lead.mapsUrl);

  if (tabId) {

    const result = await prepareAuditTabAndScrape(tabId, lead);

    snapshotPartial = result.snapshot;

    errorMessage = result.errorMessage;



    if (!snapshotHasCoreData(snapshotPartial)) {

      errorMessage = errorMessage || 'Could not scrape GBP panel from Maps.';

    }

  } else {

    errorMessage = 'Could not open Google Maps for audit.';

  }

  // Maps carries neither services nor service areas; only Search's place viewer does.
  {
    const fields = await harvestSearchProfileFields(
      snapshotPartial?.name || request.name,
      snapshotPartial?.address || request.address || '',
      request.kgMid ?? null
    );
    if (fields) {
      snapshotPartial = {
        ...(snapshotPartial ?? {}),
        services: fields.services.length
          ? fields.services
          : snapshotPartial?.services ?? [],
        serviceAreas: fields.serviceAreas,
      };
    }
  }



  const snapshot = mergeLeadIntoSnapshot(lead, {

    ...(snapshotPartial ?? {}),

    hasWebsite: snapshotPartial?.hasWebsite ?? false,

  });

  const audit = buildGbpAudit(snapshot, lead);

  if (errorMessage && !snapshotHasCoreData(snapshotPartial)) {

    audit.status = 'done';

    audit.errorMessage = errorMessage;

  }



  const auditedAt = new Date().toISOString();
  const existingEntry = await getStandaloneEntry(request.placeId);

  const savedEntry = {
    placeId: request.placeId,
    name: snapshot.name || request.name,
    mapsUrl: lead.mapsUrl,
    audit,
    auditedAt,
    emails: existingEntry?.emails ?? [],
    facebook: existingEntry?.facebook ?? '',
    instagram: existingEntry?.instagram ?? '',
    linkedin: existingEntry?.linkedin ?? '',
    twitter: existingEntry?.twitter ?? '',
    youtube: existingEntry?.youtube ?? '',
    tiktok: existingEntry?.tiktok ?? '',
    yelp: existingEntry?.yelp ?? '',
    yellowpages: existingEntry?.yellowpages ?? '',
    bbb: existingEntry?.bbb ?? '',
    angi: existingEntry?.angi ?? '',
    thumbtack: existingEntry?.thumbtack ?? '',
    manta: existingEntry?.manta ?? '',
    foursquare: existingEntry?.foursquare ?? '',
    mapquest: existingEntry?.mapquest ?? '',
    otherSocial: existingEntry?.otherSocial ?? [],
    ownerName: existingEntry?.ownerName ?? '',
    ownerTitle: existingEntry?.ownerTitle ?? '',
    ownerLinkedIn: existingEntry?.ownerLinkedIn ?? '',
    ownerSource: existingEntry?.ownerSource ?? '',
    facebookSource: existingEntry?.facebookSource ?? '',
    instagramSource: existingEntry?.instagramSource ?? '',
    linkedinSource: existingEntry?.linkedinSource ?? '',
    twitterSource: existingEntry?.twitterSource ?? '',
    tiktokSource: existingEntry?.tiktokSource ?? '',
    yelpSource: existingEntry?.yelpSource ?? '',
    yellowpagesSource: existingEntry?.yellowpagesSource ?? '',
    bbbSource: existingEntry?.bbbSource ?? '',
    angiSource: existingEntry?.angiSource ?? '',
    thumbtackSource: existingEntry?.thumbtackSource ?? '',
    mantaSource: existingEntry?.mantaSource ?? '',
    foursquareSource: existingEntry?.foursquareSource ?? '',
    mapquestSource: existingEntry?.mapquestSource ?? '',
    emailSources: existingEntry?.emailSources ?? '',
    enrichmentStatus: existingEntry?.enrichmentStatus ?? 'pending',
  };

  await upsertStandaloneEntry(savedEntry);

  if (audit.status === 'done') {
    await appendAuditHistory(savedEntry, 'standalone');
  }



  notifyAuditDone(request.placeId, audit.score, audit.status, sourceTabId, auditedAt);

  if (audit.status === 'done') {
    triggerAuditEnrichment(
      normalizeBusinessLead({
        id: request.placeId,
        name: snapshot.name || request.name,
        mapsUrl: lead.mapsUrl,
        category: snapshot.primaryCategory ?? request.category ?? '',
        address: snapshot.address ?? request.address ?? '',
        phone: snapshot.phone ?? request.phone ?? '',
        rating: request.rating ?? '',
        reviews: request.reviews ?? '',
        mapsRank: null,
        hasWebsite: false,
        ...emptyContactFields(),
      })
    );
  }

  const queueItem = markAuditQueueFinished({
    key: request.placeId,
    kind: 'standalone',
    status: audit.status === 'done' ? 'done' : 'error',
    score: audit.score,
  });
  if (queueItem) {
    queueItem.openWhenDone = openWhenDone;
    await handleAuditQueueItemComplete(queueItem);
  }
}



export async function getCachedAuditScore(placeId: string): Promise<number | null> {

  const entry = await getStandaloneEntry(placeId);

  if (entry?.audit.status === 'done') return entry.audit.score;

  return null;

}


