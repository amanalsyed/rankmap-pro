import {
  computeDistanceKm,
  parseRatingValue,
  parseReviewCount,
} from '../local-scan/aggregate';
import { parseMapsSearchCenter, parseMapsSearchKeyword } from '../local-scan/parse-maps-context';
import {
  buildScanCacheKey,
  getCachedScan,
  saveScanCache,
} from '../local-scan/store';
import { resolveCardCategories, resolveQuickScanCategories } from './listing-categories';
import { resolveListingCoordinates, resolveQuickScanCoordinates } from './listing-coordinates';
import type { LocalScanBusiness, LocalScanMode, LocalScanSession } from '../local-scan/types';
import { emptyLocalScanBusiness } from '../local-scan/types';
import {
  buildMapsUrlFromCid,
  decimalCidFromHexFid,
  extractChijFromUrl,
  extractDecimalCidFromUrl,
  extractHexFidFromCard,
  extractHexFidFromUrl,
  extractPlaceId,
  getPlaceLink,
  getResultFeed,
  getResultItems,
  getResultCard,
  observeDomChanges,
  resolveListingPlaceId,
  sleep,
  sortCardsByVisualOrder,
} from './dom-utils';
import {
  handleInvalidExtensionContext,
  isExtensionContextValid,
  isContextInvalidatedError,
  safeRuntimeOnMessage,
  safeRuntimeSendMessage,
} from './extension-context';
import { cardForPlaceId, deepScrapeListing } from './local-scan-deep';
import { runParallelDeepScan } from './local-scan-deep-parallel';
import { USE_PARALLEL_DEEP_SCAN } from './deep-scan-config';
import {
  fetchAllCategoriesFromMainWorld,
  type CategoryLookupMaps,
} from './maps-categories-bridge';
import {
  fetchAllIdentifiersFromMainWorld,
  type IdentifierLookupMaps,
} from './maps-identifiers-bridge';
import {
  cardHasWebsite,
  extractLeadFromCard,
  getAbsoluteMapsUrl,
  getPanelName,
} from './website-detector';
import {
  collectSearchListingCards,
  findSearchBarMount,
  findSearchPlacesHeaderMount,
  getSearchResultsLabel,
  isGoogleSearchPage,
  isGoogleHost,
  onListingToolsActivation,
} from './search-dom-utils';

const STYLE_ID = 'nwf-local-scan-style';
const BAR_ID = 'nwf-local-scan-bar';
const BAR_ATTR = 'data-nwf-local-scan-mounted';

let scanning = false;
let stopRequested = false;
let injectIntervalId: number | null = null;
let bodyObserver: MutationObserver | null = null;
let feedObserver: MutationObserver | null = null;
let observersStopped = false;

function notifyExtensionReloadNeeded(): void {
  setBarStatus('Extension updated — refresh this Maps page.');
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BAR_ID} {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      margin: 0 0 8px;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      background: linear-gradient(180deg, #eff6ff 0%, #eef2ff 100%);
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.08);
      position: sticky;
      top: 0;
      z-index: 6;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    #${BAR_ID}.is-places-header {
      display: inline-flex;
      width: auto;
      max-width: none;
      margin: 0 0 0 10px;
      padding: 6px 10px;
      position: static;
      vertical-align: middle;
      flex-wrap: nowrap;
    }

    #${BAR_ID}.is-places-header .nwf-local-scan-copy,
    #${BAR_ID}.is-places-header .nwf-local-scan-progress,
    #${BAR_ID}.is-places-header .nwf-local-scan-status {
      display: none;
    }

    #${BAR_ID}.is-places-header .nwf-local-scan-btn {
      padding: 7px 12px;
      font-size: 11px;
    }

    .nwf-local-scan-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .nwf-local-scan-btn {
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 8px 14px;
      font: 600 12px/1 'Poppins', system-ui, sans-serif;
      color: #fff;
      background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
      box-shadow: 0 6px 16px rgba(79, 70, 229, 0.28);
      cursor: pointer;
      white-space: nowrap;
    }

    .nwf-local-scan-btn.is-deep {
      background: linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%);
      box-shadow: 0 6px 16px rgba(2, 132, 199, 0.28);
    }

    .nwf-local-scan-btn.is-stop {
      background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
      box-shadow: 0 6px 16px rgba(220, 38, 38, 0.24);
    }

    .nwf-local-scan-btn:hover:not(:disabled) {
      filter: brightness(1.03);
    }

    .nwf-local-scan-btn:disabled {
      opacity: 0.72;
      cursor: wait;
    }

    .nwf-local-scan-copy {
      font: 500 12px/1.35 'Poppins', system-ui, sans-serif;
      color: #4338ca;
      flex: 1;
      min-width: 160px;
    }

    .nwf-local-scan-status {
      font: 500 11px/1.35 'Poppins', system-ui, sans-serif;
      color: #6b7280;
      width: 100%;
      text-align: right;
    }

    .nwf-local-scan-progress {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: rgba(79, 70, 229, 0.12);
      overflow: hidden;
      display: none;
    }

    .nwf-local-scan-progress.visible {
      display: block;
    }

    .nwf-local-scan-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, #6366f1, #0ea5e9);
      transition: width 0.25s ease;
    }
  `;
  document.documentElement.appendChild(style);
}

function getResultsLabel(): string | null {
  const el = document.querySelector('[aria-label*="Results for"]');
  const mapsLabel = el?.getAttribute('aria-label') ?? null;
  if (mapsLabel) return mapsLabel;
  return getSearchResultsLabel();
}

function collectListingCards(): HTMLElement[] {
  const feed = getResultFeed();
  const cards: HTMLElement[] = [];
  const seen = new Set<string>();

  const addCard = (card: HTMLElement) => {
    const placeId = resolveListingPlaceId(card);
    if (!placeId || seen.has(placeId)) return;
    seen.add(placeId);
    cards.push(card);
  };

  if (feed) {
    for (const card of getResultItems(feed)) {
      addCard(card);
    }
  }

  if (cards.length === 0) {
    document.querySelectorAll('a[href*="/maps/place/"], a[href*="maps?cid"]').forEach((link) => {
      const card = getResultCard(link);
      if (card) addCard(card);
    });
  }

  if (cards.length === 0 && isGoogleSearchPage()) {
    for (const card of collectSearchListingCards()) {
      addCard(card);
    }
  }

  return cards;
}

function cardListingKeys(card: HTMLElement): {
  placeId: string;
  hexFid: string | null;
  chij: string | null;
  decimalCid: string | null;
} {
  const link = getPlaceLink(card);
  const href = link?.getAttribute('href') ?? link?.getAttribute('data-url') ?? '';
  const hexFid = extractHexFidFromCard(card) ?? extractHexFidFromUrl(href);

  // Search listings carry no place link, so fall back to the feature id / CID
  // exposed on the Directions anchor.
  const decimalCid =
    extractDecimalCidFromUrl(href) ??
    card.getAttribute('data-cid') ??
    card.closest('[data-cid]')?.getAttribute('data-cid') ??
    decimalCidFromHexFid(hexFid);

  return {
    placeId: extractPlaceId(href) || resolveListingPlaceId(card) || href,
    hexFid,
    chij: extractChijFromUrl(href),
    decimalCid,
  };
}

function setBarStatus(text: string): void {
  const status = document.getElementById(BAR_ID)?.querySelector('.nwf-local-scan-status');
  if (status) status.textContent = text;
}

function setProgress(current: number, total: number): void {
  const wrap = document.getElementById(BAR_ID)?.querySelector<HTMLElement>('.nwf-local-scan-progress');
  const fill = document.getElementById(BAR_ID)?.querySelector<HTMLElement>('.nwf-local-scan-progress-fill');
  if (!wrap || !fill) return;
  wrap.classList.toggle('visible', total > 0 && scanning);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  fill.style.width = `${pct}%`;
}

function isDeepScanAvailable(): boolean {
  return !isGoogleSearchPage();
}

function syncDeepScanControls(bar: HTMLElement): void {
  const deepBtn = bar.querySelector<HTMLButtonElement>('[data-nwf-scan="deep"]');
  const stopBtn = bar.querySelector<HTMLButtonElement>('[data-nwf-scan="stop"]');
  const available = isDeepScanAvailable();

  if (deepBtn) deepBtn.hidden = !available;
  if (stopBtn && !available) stopBtn.hidden = true;
}

function setButtonsBusy(busy: boolean, mode: LocalScanMode | null): void {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;

  const quickBtn = bar.querySelector<HTMLButtonElement>('[data-nwf-scan="quick"]');
  const deepBtn = bar.querySelector<HTMLButtonElement>('[data-nwf-scan="deep"]');
  const stopBtn = bar.querySelector<HTMLButtonElement>('[data-nwf-scan="stop"]');

  if (quickBtn) {
    quickBtn.disabled = busy;
    quickBtn.textContent = busy && mode === 'quick' ? 'Scanning…' : 'Quick Scan';
  }
  if (deepBtn) {
    deepBtn.disabled = busy;
    deepBtn.textContent = busy && mode === 'deep' ? 'Deep scanning…' : 'Deep Scan';
  }
  if (stopBtn) {
    stopBtn.hidden = !busy || mode !== 'deep';
  }
}

function findBarMount(cards: HTMLElement[]): {
  parent: HTMLElement;
  before: Element | null;
  inlineHeader?: boolean;
} | null {
  if (isGoogleSearchPage()) {
    const placesHeader = findSearchPlacesHeaderMount();
    if (placesHeader) {
      return { ...placesHeader, inlineHeader: true };
    }
    const ordered = sortCardsByVisualOrder(cards);
    const searchMount = findSearchBarMount(ordered[0] ?? null);
    if (searchMount) return searchMount;
  }

  const feed = getResultFeed();
  if (!feed?.parentElement) return null;
  return { parent: feed.parentElement, before: feed };
}

function injectLocalScanBar(): void {
  if (!isExtensionContextValid()) return;

  const cards = collectListingCards();
  if (cards.length === 0) {
    if (!scanning) document.getElementById(BAR_ID)?.remove();
    return;
  }

  const mount = findBarMount(cards);
  if (!mount) return;

  ensureStyles();

  let bar = document.getElementById(BAR_ID) as HTMLElement | null;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute(BAR_ATTR, '1');
    bar.innerHTML = `
      <div class="nwf-local-scan-actions">
        <button type="button" class="nwf-local-scan-btn" data-nwf-scan="quick">Quick Scan</button>
        <button type="button" class="nwf-local-scan-btn is-deep" data-nwf-scan="deep">Deep Scan</button>
        <button type="button" class="nwf-local-scan-btn is-stop" data-nwf-scan="stop" hidden>Stop</button>
      </div>
      <div class="nwf-local-scan-copy">Scan ${cards.length} businesses for leads without websites</div>
      <div class="nwf-local-scan-progress"><div class="nwf-local-scan-progress-fill"></div></div>
      <div class="nwf-local-scan-status"></div>
    `;
    mount.parent.insertBefore(bar, mount.before);

    bar.querySelector('[data-nwf-scan="quick"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void runLocalScan('quick');
    });
    bar.querySelector('[data-nwf-scan="deep"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void runLocalScan('deep');
    });
    bar.querySelector('[data-nwf-scan="stop"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      stopRequested = true;
      setBarStatus('Stopping deep scan…');
    });
  } else if (bar.parentElement !== mount.parent || bar.nextElementSibling !== mount.before) {
    mount.parent.insertBefore(bar, mount.before);
  }

  bar.classList.toggle('is-places-header', mount.inlineHeader === true);
  syncDeepScanControls(bar);

  const copy = bar.querySelector('.nwf-local-scan-copy');
  if (copy) {
    copy.textContent = isDeepScanAvailable()
      ? `Scan ${cards.length} businesses · Quick = instant · Deep = full GBP scrape`
      : `Scan ${cards.length} businesses`;
  }
}

async function buildQuickBusinesses(
  categoryMaps: CategoryLookupMaps | null,
  identifierMaps: IdentifierLookupMaps | null,
  searchKeyword: string,
  options: { fast?: boolean } = {}
): Promise<{ businesses: LocalScanBusiness[]; center: { lat: number | null; lng: number | null }; keyword: string; mapsUrl: string }> {
  const cards = collectListingCards();
  const pageLabel = getResultsLabel();
  const mapsUrl = window.location.href;
  const keyword = searchKeyword || parseMapsSearchKeyword(mapsUrl, pageLabel);
  const center = parseMapsSearchCenter(mapsUrl);

  const businesses: LocalScanBusiness[] = [];
  const fast = options.fast === true;

  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    const { placeId, hexFid, chij, decimalCid } = cardListingKeys(card);
    const rank = index + 1;
    const lead = extractLeadFromCard(card, placeId, rank);
    const href = getPlaceLink(card)?.getAttribute('href') ?? '';
    const absoluteMapsUrl = getAbsoluteMapsUrl(href) || buildMapsUrlFromCid(decimalCid);

    let categories: { primary: string; secondary: string[] };
    let lat: number | null;
    let lng: number | null;

    if (fast) {
      categories = resolveQuickScanCategories(
        { placeId, hexFid, chij, decimalCid },
        { cacheMaps: categoryMaps, fallbackCategory: lead?.category ?? '' }
      );
      const coords = resolveQuickScanCoordinates(
        { placeId, hexFid, chij, decimalCid },
        { placeUrl: absoluteMapsUrl, card, identifierMaps }
      );
      lat = coords.lat;
      lng = coords.lng;
    } else {
      const resolvedCategories = await resolveCardCategories(
        { placeId, hexFid, chij, decimalCid },
        { cacheMaps: categoryMaps, timeoutMs: 7000 }
      );
      categories = resolvedCategories ?? { primary: lead?.category ?? '', secondary: [] };

      const coords = await resolveListingCoordinates(
        { placeId, hexFid, chij, decimalCid },
        { placeUrl: absoluteMapsUrl, card, identifierMaps, timeoutMs: 5000 }
      );
      lat = coords.lat;
      lng = coords.lng;
    }

    // Quick scan: only check the listing card for visible website link
    const hasWebsite = cardHasWebsite(card);

    businesses.push(
      emptyLocalScanBusiness({
        placeId,
        rank,
        name: lead?.name ?? 'Unknown Business',
        primaryCategory: categories.primary ?? '',
        secondaryCategories: categories.secondary ?? [],
        rating: parseRatingValue(lead?.rating),
        reviewCount: parseReviewCount(lead?.reviews),
        address: lead?.address ?? '',
        phone: lead?.phone ?? '',
        hasWebsite,
        mapsUrl: absoluteMapsUrl,
        lat,
        lng,
        distanceKm: computeDistanceKm({ lat, lng }, center.lat, center.lng),
      })
    );
  }

  return { businesses, center, keyword, mapsUrl };
}

async function isLeadScanActive(): Promise<boolean> {
  try {
    const res = (await safeRuntimeSendMessage<{ state?: { progress?: { status?: string } } }>(
      { type: 'GET_STATE' },
      notifyExtensionReloadNeeded
    )) as { state?: { progress?: { status?: string } } } | undefined;

    const status = res?.state?.progress?.status;
    return status === 'scanning' || status === 'paused' || status === 'enriching';
  } catch {
    return false;
  }
}

async function runDeepScrapePass(
  session: LocalScanSession,
  center: { lat: number | null; lng: number | null },
  maxDeepScans: number
): Promise<LocalScanBusiness[]> {
  // Feature flag: Use parallel or sequential implementation
  if (USE_PARALLEL_DEEP_SCAN) {
    return runDeepScrapePassParallel(session, center, maxDeepScans);
  } else {
    return runDeepScrapePassSequential(session, center, maxDeepScans);
  }
}

/**
 * ORIGINAL SEQUENTIAL IMPLEMENTATION (BACKUP)
 * This is the proven, accurate implementation.
 * Kept as-is for easy rollback if parallel version has issues.
 */
async function runDeepScrapePassSequential(
  session: LocalScanSession,
  center: { lat: number | null; lng: number | null },
  maxDeepScans: number
): Promise<LocalScanBusiness[]> {
  const total = session.businesses.length;
  const deepLimit = Math.min(maxDeepScans, total);
  const updated: LocalScanBusiness[] = [];
  let previousPanelName = getPanelName();

  for (let i = 0; i < total; i++) {
    if (stopRequested) {
      updated.push(...session.businesses.slice(i));
      break;
    }

    const business = session.businesses[i];

    if (i >= deepLimit) {
      updated.push({
        ...business,
        deepScraped: false,
        scrapeError: 'Skipped — monthly deep scan limit reached.',
      });
      setBarStatus(`Skipping ${business.name} (${i + 1}/${total}, quick data only)`);
      setProgress(i + 1, total);
      continue;
    }

    setBarStatus(`⚠️ Deep scan ${i + 1}/${deepLimit}: ${business.name} — Keep this tab open!`);
    setProgress(i, deepLimit);

    const cards = collectListingCards();
    const card = cardForPlaceId(cards, business.placeId);
    if (!card) {
      updated.push({
        ...business,
        deepScraped: false,
        scrapeError: 'Listing card not found in feed.',
      });
      continue;
    }

    card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    await sleep(400);

    // Re-query after scroll — the feed may have re-rendered and detached the old reference.
    const liveCards = collectListingCards();
    const liveCard = cardForPlaceId(liveCards, business.placeId) ?? card;

    const scraped = await deepScrapeListing(liveCard, business, center, previousPanelName);
    previousPanelName = getPanelName();
    updated.push(scraped);
    await sleep(300);
  }

  setProgress(updated.length, total);
  return updated;
}

/**
 * NEW PARALLEL IMPLEMENTATION (3 WORKERS)
 * Uses parallel workers for 2-3x speed improvement.
 */
async function runDeepScrapePassParallel(
  session: LocalScanSession,
  center: { lat: number | null; lng: number | null },
  maxDeepScans: number
): Promise<LocalScanBusiness[]> {
  const deepLimit = Math.min(maxDeepScans, session.businesses.length);
  const cards = collectListingCards();

  setBarStatus(`⚠️ Starting parallel deep scan (3 workers)... Do not close this tab!`);
  setProgress(0, deepLimit);

  const results = await runParallelDeepScan(
    session.businesses,
    cards,
    center,
    maxDeepScans,
    (current, _total, businessName) => {
      setBarStatus(`⚠️ Deep scan ${current}/${deepLimit}: ${businessName} — Keep this tab open!`);
      setProgress(current, deepLimit);
    },
    () => stopRequested
  );

  setProgress(results.length, session.businesses.length);
  return results;
}

interface DeepScanQuotaResponse {
  ok?: boolean;
  error?: string;
  maxDeepScans?: number;
  skipped?: number;
  notice?: string;
}

async function runLocalScan(mode: LocalScanMode): Promise<void> {
  if (scanning || !isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }

  const cards = collectListingCards();
  if (cards.length === 0) {
    setBarStatus('No businesses found in this search.');
    return;
  }

  if (mode === 'deep' && !isDeepScanAvailable()) {
    setBarStatus('Deep Scan is only available on Google Maps.');
    return;
  }

  let deepScanCap = cards.length;
  let deepScanSkipped = 0;

  if (mode === 'deep') {
    const quotaRes = await safeRuntimeSendMessage<DeepScanQuotaResponse>(
      { type: 'CHECK_DEEP_SCAN_QUOTA', count: cards.length },
      notifyExtensionReloadNeeded
    );
    if (!quotaRes?.ok) {
      setBarStatus(quotaRes?.error ?? 'Deep scan not allowed. Sign in or upgrade in Settings → Account.');
      return;
    }
    deepScanCap = quotaRes.maxDeepScans ?? cards.length;
    deepScanSkipped = quotaRes.skipped ?? 0;
    if (deepScanSkipped > 0 && quotaRes.notice) {
      setBarStatus(quotaRes.notice);
    }
  }

  if (await isLeadScanActive()) {
    setBarStatus('Stop the lead scan first before running Local Scan.');
    return;
  }

  scanning = true;
  stopRequested = false;
  setButtonsBusy(true, mode);

  const pageLabel = getResultsLabel();
  const mapsUrl = window.location.href;
  const searchKeyword = parseMapsSearchKeyword(mapsUrl, pageLabel);
  const center = parseMapsSearchCenter(mapsUrl);

  if (mode === 'quick') {
    const cacheKey = buildScanCacheKey(searchKeyword, center.lat, center.lng, 'quick');
    const cached = await getCachedScan(cacheKey);
    if (cached?.businesses?.length) {
      setBarStatus(`Using cached quick scan (${cached.businesses.length} listings)…`);
      const session: LocalScanSession = {
        ...cached,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        fromCache: true,
        mode: 'quick',
        context: {
          ...cached.context,
          keyword: searchKeyword || cached.context.keyword,
          searchCenterLat: center.lat ?? cached.context.searchCenterLat,
          searchCenterLng: center.lng ?? cached.context.searchCenterLng,
          mapsUrl,
        },
      };

      const res = await safeRuntimeSendMessage<{ ok?: boolean; sessionId?: string }>(
        { type: 'LOCAL_SCAN_COMPLETE', session },
        notifyExtensionReloadNeeded
      );

      if (res?.ok) {
        setBarStatus(`Quick scan ready (cached) — ${session.businesses.length} businesses compared.`);
      } else {
        setBarStatus('Local Scan failed. Try refreshing the page.');
      }

      scanning = false;
      setButtonsBusy(false, null);
      return;
    }

    const quickQuotaRes = await safeRuntimeSendMessage<{ ok?: boolean; error?: string }>(
      { type: 'CHECK_QUICK_SCAN_QUOTA' },
      notifyExtensionReloadNeeded
    );
    if (!quickQuotaRes?.ok) {
      setBarStatus(
        quickQuotaRes?.error ?? 'Quick scan not allowed. Sign in or upgrade in Settings → Account.'
      );
      scanning = false;
      setButtonsBusy(false, null);
      return;
    }
  }

  setBarStatus(
    mode === 'deep'
      ? deepScanSkipped > 0
        ? `⚠️ Starting deep scan for ${deepScanCap} of ${cards.length} listings… Do not close this tab!`
        : `⚠️ Starting deep scan for ${cards.length} listings… Do not close this tab!`
      : `Analyzing ${cards.length} listings…`
  );
  setProgress(0, mode === 'deep' ? deepScanCap : 0);

  try {
    const pageLabelInner = getResultsLabel();
    const mapsUrlInner = window.location.href;
    const searchKeywordInner = parseMapsSearchKeyword(mapsUrlInner, pageLabelInner);

    let categoryMaps: CategoryLookupMaps | null = null;
    let identifierMaps: IdentifierLookupMaps | null = null;

    if (mode === 'quick') {
      // Warm bulk caches in the background — Quick Scan reads card DOM only and
      // never waits on these fetches (keeps 50+ listing scans instant).
      void fetchAllCategoriesFromMainWorld({ timeoutMs: 8000 });
      void fetchAllIdentifiersFromMainWorld({ timeoutMs: 8000 });
    } else {
      [categoryMaps, identifierMaps] = await Promise.all([
        fetchAllCategoriesFromMainWorld({ force: true, timeoutMs: 7000 }),
        fetchAllIdentifiersFromMainWorld({ force: true, timeoutMs: 7000 }),
      ]);
    }

    const { businesses, center: resolvedCenter, keyword, mapsUrl: contextUrl } = await buildQuickBusinesses(
      categoryMaps,
      identifierMaps,
      searchKeywordInner,
      { fast: mode === 'quick' }
    );

    if (businesses.length === 0) {
      setBarStatus('Could not collect businesses for this search.');
      return;
    }

    let session: LocalScanSession = {
      id: crypto.randomUUID(),
      mode,
      createdAt: new Date().toISOString(),
      context: {
        keyword,
        searchCenterLat: resolvedCenter.lat,
        searchCenterLng: resolvedCenter.lng,
        mapsUrl: contextUrl,
      },
      businesses,
    };

    if (mode === 'deep') {
      const deepBusinesses = await runDeepScrapePass(session, resolvedCenter, deepScanCap);
      session = {
        ...session,
        businesses: deepBusinesses.length > 0 ? deepBusinesses : session.businesses,
        mode: 'deep',
      };
    } else {
      const cacheKey = buildScanCacheKey(
        keyword,
        resolvedCenter.lat,
        resolvedCenter.lng,
        'quick'
      );
      await saveScanCache(cacheKey, session);
    }

    if (stopRequested && mode === 'deep') {
      setBarStatus(`Deep scan stopped — saved ${session.businesses.filter((b) => b.deepScraped).length} profiles.`);
    } else if (mode === 'deep' && deepScanSkipped > 0) {
      const deepCount = session.businesses.filter((b) => b.deepScraped).length;
      setBarStatus(`Opening report for ${deepCount} deep-scanned business${deepCount === 1 ? '' : 'es'}…`);
    } else {
      setBarStatus(`Opening report for ${session.businesses.length} businesses…`);
    }

    const res = await safeRuntimeSendMessage<{ ok?: boolean; sessionId?: string; error?: string }>(
      { type: 'LOCAL_SCAN_COMPLETE', session },
      notifyExtensionReloadNeeded
    );

    if (res?.ok) {
      if (!stopRequested) {
        if (mode === 'deep') {
          const deepCount = session.businesses.filter((b) => b.deepScraped).length;
          setBarStatus(
            deepScanSkipped > 0
              ? `Deep scan complete — ${deepCount} deep profiles, ${deepScanSkipped} quick-only (${session.businesses.length} total).`
              : `Deep scan complete — ${session.businesses.length} businesses analyzed.`
          );
        } else {
          setBarStatus(`Quick scan ready — ${session.businesses.length} businesses compared.`);
        }
      }
    } else {
      setBarStatus(res?.error ?? 'Local Scan failed. Try refreshing the page.');
    }
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      handleInvalidExtensionContext(notifyExtensionReloadNeeded);
      stopObservers();
    }
    setBarStatus('Local Scan failed. Try again.');
  } finally {
    scanning = false;
    stopRequested = false;
    setButtonsBusy(false, null);
    setProgress(0, 0);
  }
}

function stopObservers(): void {
  if (observersStopped) return;
  observersStopped = true;

  if (injectIntervalId !== null) {
    window.clearInterval(injectIntervalId);
    injectIntervalId = null;
  }

  bodyObserver?.disconnect();
  feedObserver?.disconnect();
  bodyObserver = null;
  feedObserver = null;
}

function startObservers(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }

  injectLocalScanBar();
  bodyObserver = observeDomChanges(document.body, injectLocalScanBar, 350);

  const feed = getResultFeed();
  if (feed) {
    feedObserver = observeDomChanges(feed, injectLocalScanBar, 300);
    feed.addEventListener('scroll', injectLocalScanBar, { passive: true });
  }

  injectIntervalId = window.setInterval(injectLocalScanBar, 2500);
}

let localScanStarted = false;

function startLocalScanFeatures(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }

  if (localScanStarted) {
    injectLocalScanBar();
    return;
  }
  localScanStarted = true;

  safeRuntimeOnMessage((message) => {
    if (message.type === 'STOP_LOCAL_SCAN') {
      stopRequested = true;
      setBarStatus('Stopping deep scan…');
    }
  }, notifyExtensionReloadNeeded);

  ensureStyles();
  startObservers();

  window.setTimeout(injectLocalScanBar, 800);
  window.setTimeout(injectLocalScanBar, 2200);
}

function initLocalScan(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }
  if (!isGoogleHost()) return;

  onListingToolsActivation(startLocalScanFeatures);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLocalScan);
} else {
  initLocalScan();
}

export {};
