import { computeDistanceKm } from '../local-scan/aggregate';
import { resolveDeepScanCategories } from './listing-categories';
import { readOpenPanelCoordinates } from './listing-coordinates';
import { businessScrapeFailed, mergeSnapshotIntoBusiness } from '../local-scan/merge-snapshot';
import type { LocalScanBusiness } from '../local-scan/types';
import type { GbpProfileSnapshot } from '../audit/types';
import { buildAuditRequestFromListingCard } from '../gbp-audit/build-audit-request';
import type { StandaloneGbpAuditRequest } from '../gbp-audit/types';
import { extractPlaceId, getPlaceLink, sleep } from './dom-utils';
import { extractOpenPanelAttributes, runGbpAudit, waitForHoursSectionReady } from './gbp-auditor';
import { safeRuntimeSendMessage } from './extension-context';
import { extractMapsIdentifiersAsync } from './maps-identifiers';
import {
  extractLeadFromCard,
  getPanelName,
  namesMatch,
  panelHasDetailContent,
  waitForPanelSwitch,
} from './website-detector';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function buildDeepScanAuditRequest(
  card: HTMLElement,
  business: LocalScanBusiness
): StandaloneGbpAuditRequest | null {
  return buildAuditRequestFromListingCard(card, {
    placeId: business.placeId,
    name: business.name,
    address: business.address,
    phone: business.phone,
    mapsUrl: business.mapsUrl,
    kgMid: business.knowledgeGraphId?.trim() || undefined,
  });
}

/** Place-page scrape — same engine as GBP Audit, with one retry when hours are missing. */
async function fetchPlacePageSnapshot(
  request: StandaloneGbpAuditRequest
): Promise<Partial<GbpProfileSnapshot> | null> {
  const send = () =>
    safeRuntimeSendMessage<{
      ok?: boolean;
      snapshot?: Partial<GbpProfileSnapshot> | null;
    }>({
      type: 'DEEP_SCAN_AUDIT_PLACE',
      request,
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(900);

    try {
      const res = await send();
      const snapshot = res?.snapshot ?? null;
      if (snapshot?.hours?.trim()) {
        return snapshot;
      }
      if (snapshot && attempt === 1) {
        return snapshot;
      }
      if (snapshot && !snapshot.hours?.trim() && attempt === 0) continue;
      if (snapshot) {
        return snapshot;
      }
    } catch (err) {
      // retry
    }
  }

  return null;
}

/**
 * Deep scan hours come from the /maps/place tab (GBP Audit path). The search side
 * panel is only used to supplement attributes the place page may miss.
 */
function mergePlacePageSnapshot(
  panelSnapshot: Partial<GbpProfileSnapshot>,
  placeSnapshot: Partial<GbpProfileSnapshot> | null
): Partial<GbpProfileSnapshot> {
  if (!placeSnapshot) return panelSnapshot;

  const placeHours = placeSnapshot.hours?.trim() ?? '';
  const panelHours = panelSnapshot.hours?.trim() ?? '';
  const hours =
    placeHours ||
    panelHours ||
    '';

  const specialHours =
    placeSnapshot.specialHours?.trim() ||
    panelSnapshot.specialHours?.trim() ||
    '';

  return {
    ...panelSnapshot,
    ...placeSnapshot,
    name: placeSnapshot.name || panelSnapshot.name,
    address: placeSnapshot.address || panelSnapshot.address,
    phone: placeSnapshot.phone || panelSnapshot.phone,
    website: placeSnapshot.website || panelSnapshot.website,
    hasWebsite: placeSnapshot.hasWebsite ?? panelSnapshot.hasWebsite,
    hours,
    specialHours,
    services: panelSnapshot.services?.length ? panelSnapshot.services : placeSnapshot.services,
    attributes: panelSnapshot.attributes?.length
      ? panelSnapshot.attributes
      : placeSnapshot.attributes,
    bookingLink: panelSnapshot.bookingLink || placeSnapshot.bookingLink,
    primaryCategory: panelSnapshot.primaryCategory || placeSnapshot.primaryCategory,
    secondaryCategories: panelSnapshot.secondaryCategories?.length
      ? panelSnapshot.secondaryCategories
      : placeSnapshot.secondaryCategories,
  };
}

/** Same Search place-viewer harvest the standalone GBP audit uses for services. */
async function harvestSearchProfile(
  name: string,
  address: string,
  kgMid: string | null
): Promise<{ services: string[]; serviceAreas: string[] } | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  try {
    const res = await safeRuntimeSendMessage<{
      ok?: boolean;
      services?: string[];
      serviceAreas?: string[];
    }>({
      type: 'HARVEST_SEARCH_PROFILE',
      name: trimmedName,
      address: address.trim(),
      kgMid,
    });
    if (!res?.ok) return null;
    return {
      services: res.services ?? [],
      serviceAreas: res.serviceAreas ?? [],
    };
  } catch {
    return null;
  }
}

function mergeHarvestFields(
  snapshot: Partial<GbpProfileSnapshot>,
  harvested: { services: string[]; serviceAreas: string[] }
): Partial<GbpProfileSnapshot> {
  return {
    ...snapshot,
    services: harvested.services.length ? harvested.services : snapshot.services,
    serviceAreas: harvested.serviceAreas.length ? harvested.serviceAreas : snapshot.serviceAreas,
  };
}

function hasDeepScrapeData(snapshot: Partial<GbpProfileSnapshot>): boolean {
  if (snapshot.hours?.trim()) return true;
  if (snapshot.services?.length) return true;
  if (snapshot.attributes?.length) return true;
  if (snapshot.bookingLink?.trim()) return true;
  if (snapshot.address?.trim()) return true;
  if (snapshot.phone?.trim()) return true;
  return false;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export async function deepScrapeListing(
  card: HTMLElement,
  business: LocalScanBusiness,
  center: { lat: number | null; lng: number | null },
  previousPanelName = ''
): Promise<LocalScanBusiness> {
  const priorName = previousPanelName || getPanelName();
  const expectedName = business.name.trim();

  const panelSwitched = (name: string): boolean => {
    if (!name) return false;
    if (expectedName && namesMatch(name, expectedName)) return true;
    if (priorName && !namesMatch(name, priorName)) return true;
    if (!priorName) return true;
    return false;
  };

  const auditRequest = buildDeepScanAuditRequest(card, business);

  const clickTarget = getPlaceLink(card) ?? card;
  clickTarget.click();

  let newPanelName = await waitForPanelSwitch(priorName, 10000, expectedName);

  if (!panelSwitched(newPanelName)) {
    card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    await sleep(400);
    clickTarget.click();
    newPanelName = await waitForPanelSwitch(priorName, 7000, expectedName);
  }

  if (!panelSwitched(newPanelName)) {
    return businessScrapeFailed(business, 'Detail panel did not open.');
  }

  const lead = extractLeadFromCard(card, business.placeId, business.rank);
  if (!lead) {
    return businessScrapeFailed(business, 'Could not read listing from card.');
  }

  // Primary hours source: dedicated /maps/place tab (GBP Audit path).
  const placePagePromise = auditRequest ? fetchPlacePageSnapshot(auditRequest) : Promise.resolve(null);

  let contentReady = panelHasDetailContent();
  if (!contentReady) {
    await sleep(600);
    contentReady = panelHasDetailContent();
    if (!contentReady) {
      await sleep(800);
      contentReady = panelHasDetailContent();
      if (!contentReady) {
        await sleep(1000);
        contentReady = panelHasDetailContent();
      }
    }
  }

  if (!contentReady) {
    return businessScrapeFailed(business, 'Detail panel opened but content did not load.');
  }

  await waitForHoursSectionReady(3000);
  await sleep(400);

  try {
    const ids = await extractMapsIdentifiersAsync();
    const categoriesPromise = resolveDeepScanCategories(
      {
        placeId: ids.placeId ?? business.placeId,
        hexFid: ids.hexFid,
        chij: ids.placeId?.startsWith('ChIJ') ? ids.placeId : null,
        decimalCid: ids.cid,
      },
      { waitForInjectionMs: 5000, timeoutMs: 8000 }
    );

    const [panelSnapshot, placeSnapshot] = await Promise.all([
      runGbpAudit(lead),
      placePagePromise,
    ]);

    let snapshot = mergePlacePageSnapshot(panelSnapshot, placeSnapshot);

    if (!snapshot.hours?.trim() && placeSnapshot?.hours?.trim()) {
      snapshot = { ...snapshot, hours: placeSnapshot.hours, specialHours: placeSnapshot.specialHours };
    }

    const kgMid =
      snapshot.knowledgeGraphId?.trim() ||
      business.knowledgeGraphId?.trim() ||
      ids.knowledgeGraphId?.trim() ||
      null;
    const harvested = await harvestSearchProfile(
      snapshot.name || business.name || lead.name,
      snapshot.address || business.address || lead.address || '',
      kgMid
    );
    if (harvested) {
      snapshot = mergeHarvestFields(snapshot, harvested);
    }

    if (!hasDeepScrapeData(snapshot)) {
      return businessScrapeFailed(
        business,
        'Detail panel opened but returned no usable data (no hours, address, phone, or services).'
      );
    }

    let merged = mergeSnapshotIntoBusiness(business, snapshot, lead, center);

    const accurate = await categoriesPromise;

    if (accurate?.primary) {
      merged = {
        ...merged,
        primaryCategory: accurate.primary,
        secondaryCategories: accurate.secondary,
      };
    }

    const panelCoords = readOpenPanelCoordinates();
    if (panelCoords.lat != null && panelCoords.lng != null) {
      merged = {
        ...merged,
        lat: panelCoords.lat,
        lng: panelCoords.lng,
        distanceKm: computeDistanceKm(panelCoords, center.lat, center.lng),
      };
    }

    if (!merged.attributes?.length) {
      const attributes = await extractOpenPanelAttributes();
      if (attributes.length > 0) {
        merged = { ...merged, attributes };
      }
    }

    if (!merged.hours?.trim() && snapshot.hours?.trim()) {
      merged = { ...merged, hours: snapshot.hours, specialHours: snapshot.specialHours || merged.specialHours };
    }

    return merged;
  } catch (err) {
    return businessScrapeFailed(
      business,
      err instanceof Error ? err.message : 'GBP scrape failed.'
    );
  }
}

export function cardForPlaceId(cards: HTMLElement[], placeId: string): HTMLElement | null {
  for (const card of cards) {
    const href = getPlaceLink(card)?.getAttribute('href') ?? '';
    const id = extractPlaceId(href) ?? href;
    if (id === placeId || href.includes(placeId)) return card;
  }
  return null;
}
