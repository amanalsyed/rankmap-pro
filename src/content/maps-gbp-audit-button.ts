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
} from './dom-utils';
import {
  fetchAllCategoriesFromMainWorld,
  fetchCategoriesForListing,
  isPlausibleGmbCategory,
  lookupCategoriesFromCache,
  sanitizeGmbCategories,
  type BusinessCategories,
  type CategoryLookupMaps,
} from './maps-categories-bridge';
import {
  handleInvalidExtensionContext,
  isExtensionContextValid,
  isContextInvalidatedError,
  safeRuntimeOnMessage,
  safeRuntimeSendMessage,
} from './extension-context';
import {
  cleanRankCheckAddress,
  cleanRankCheckBusinessName,
  normalizeBusinessAgeLabel,
} from '../utils/business-name';
import { extractBusinessAge, extractLeadFromCard, extractPanelAddress, getAbsoluteMapsUrl, getListItemName } from './website-detector';
import { resolveListingCoordinates } from './listing-coordinates';
import { parsePlaceUrlLatLng } from './maps-id-utils';
import { findDetailCategoryInsertPoint, getBusinessPanel } from './maps-detail-panel';
import { normalizeMapsAuditUrl } from '../gbp-audit/maps-url';
import { formatAuditAge, isAuditStale } from '../utils/audit-freshness';
import {
  ensureGmbCategoryStyles,
  mountCategoryRow,
  CATEGORY_ATTR,
  CATEGORY_SIGNATURE_ATTR,
} from './maps-gmb-categories-ui';
import {
  collectSearchListingCards,
  findSearchCategoryMount,
  isGoogleSearchPage,
  isGoogleHost,
  onListingToolsActivation,
  readCardKgMid,
  readSearchCardCategory,
} from './search-dom-utils';

const STYLE_ID = 'nwf-gbp-audit-button-style';
const TOAST_ID = 'nwf-gbp-audit-toast';
const QUEUE_PILL_ID = 'nwf-gbp-audit-queue-pill';
const GUARD_FLAG = '__nwfGbpAuditGuardInstalled';
const BUTTON_ATTR = 'data-nwf-gbp-audit-for';
const AUDIT_SCOPE_ATTR = 'data-nwf-audit-scope';
const AUDIT_PLACE_ATTR = 'data-nwf-audit-place';
const auditingPlaceIds = new Set<string>();
const categoryFetchInFlight = new Set<string>();

let injectIntervalId: number | null = null;
let bodyObserver: MutationObserver | null = null;
let feedObserver: MutationObserver | null = null;
let observersStopped = false;
let categoryFetchPromise: Promise<CategoryLookupMaps> | null = null;
let categoryFetchAttempts = 0;

function notifyExtensionReloadNeeded(): void {
  showToast(
    'Extension updated',
    'Refresh this Google Maps page to continue using GMB Audit.'
  );
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

function ensureStyles(): void {
  ensureGmbCategoryStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .nwf-gbp-audit-wrap {
      display: flex !important;
      justify-content: flex-end;
      align-items: center;
      padding: 6px 12px 10px;
      margin-top: 4px;
      border-top: 1px solid rgba(60, 64, 67, 0.12);
      position: relative;
      z-index: 9999;
      isolation: isolate;
      pointer-events: auto;
      touch-action: manipulation;
      visibility: visible !important;
      opacity: 1 !important;
      width: 100%;
      box-sizing: border-box;
    }
    .nwf-gbp-audit-btn {
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 6px 14px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      cursor: pointer;
      background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%) !important;
      color: #fff !important;
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35);
      transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
      position: relative;
      z-index: 10000;
      pointer-events: auto;
      touch-action: manipulation;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .nwf-gbp-audit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.42);
    }
    .nwf-gbp-audit-btn:disabled {
      opacity: 0.72 !important;
      cursor: wait;
    }
    .nwf-gbp-audit-btn.is-done {
      background: linear-gradient(180deg, #10b981 0%, #059669 100%) !important;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);
    }
    .nwf-gbp-audit-btn.is-stale {
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.55), 0 2px 8px rgba(79, 70, 229, 0.35);
    }
    .nwf-rank-check-btn {
      appearance: none;
      border: 1px solid #dadce0;
      border-radius: 999px;
      padding: 6px 14px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      cursor: pointer;
      background: #fff !important;
      color: #1a73e8 !important;
      transition: all 0.12s ease;
      position: relative;
      z-index: 10000;
      pointer-events: auto;
      touch-action: manipulation;
      visibility: visible !important;
      opacity: 1 !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .nwf-rank-check-btn:hover {
      background: #f8f9fa !important;
      border-color: #1a73e8;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .nwf-gbp-audit-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      width: 100%;
    }
    .nwf-gbp-audit-btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      width: 100%;
    }
    .nwf-gbp-audit-wrap[data-nwf-audit-scope="detail"] {
      padding: 10px 16px 12px;
      margin: 8px 0 4px;
      border-top: 1px solid rgba(60, 64, 67, 0.12);
      border-bottom: 1px solid rgba(60, 64, 67, 0.08);
    }
    .nwf-gbp-audit-age {
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 10px;
      color: #5f6368;
      line-height: 1.2;
      text-align: right;
    }
    .nwf-gbp-audit-stale-badge {
      display: none;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b45309;
      background: #fef3c7;
      border-radius: 999px;
      padding: 2px 8px;
    }
    .nwf-gbp-audit-stale-badge.visible {
      display: inline-block;
    }
    #${TOAST_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      max-width: 320px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #1e1b4b;
      color: #fff;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #${TOAST_ID}.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    #${TOAST_ID} strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .nwf-gbp-audit-toast-action {
      display: inline-block;
      margin-top: 10px;
      padding: 6px 12px;
      border: none;
      border-radius: 999px;
      background: #6366f1;
      color: #fff;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    #${QUEUE_PILL_ID} {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 2147483645;
      max-width: 280px;
      padding: 10px 14px;
      border-radius: 999px;
      background: #1e1b4b;
      color: #fff;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    #${QUEUE_PILL_ID}.visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.documentElement.appendChild(style);
}

function showToast(
  title: string,
  message: string,
  durationMs = 5000,
  action?: { label: string; onClick: () => void }
): void {
  ensureStyles();
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  toast.replaceChildren();
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  toast.appendChild(titleEl);
  toast.appendChild(document.createTextNode(message));

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nwf-gbp-audit-toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      action.onClick();
      toast?.classList.remove('visible');
    });
    toast.appendChild(btn);
  }

  toast.classList.add('visible');
  window.setTimeout(() => toast?.classList.remove('visible'), durationMs);
}

function updateQueuePill(runningName: string | null, remainingCount: number): void {
  ensureStyles();
  let pill = document.getElementById(QUEUE_PILL_ID);
  if (!runningName && remainingCount <= 0) {
    pill?.classList.remove('visible');
    return;
  }

  if (!pill) {
    pill = document.createElement('div');
    pill.id = QUEUE_PILL_ID;
    document.body.appendChild(pill);
  }

  if (runningName) {
    pill.textContent =
      remainingCount > 0
        ? `GBP audit: ${runningName} · ${remainingCount} remaining`
        : `GBP audit: ${runningName}`;
  } else {
    pill.textContent = `${remainingCount} GBP audit${remainingCount === 1 ? '' : 's'} queued`;
  }
  pill.classList.add('visible');
}

function installInteractionGuard(): void {
  const win = window as Window & { [GUARD_FLAG]?: boolean };
  if (win[GUARD_FLAG]) return;
  win[GUARD_FLAG] = true;

  const blockMapsHandlers = (event: Event) => {
    const target = event.target as Element | null;
    if (!target?.closest('.nwf-gbp-audit-wrap')) return;
    // touchend/mouseup during feed scroll are often non-cancelable — never force preventDefault.
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  // Block Maps card navigation on press/start only; touchend during scroll triggers console noise.
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    document.addEventListener(type, blockMapsHandlers, true);
  }
}

function isInResultsFeed(el: Element): boolean {
  const feed = getResultFeed();
  if (feed?.contains(el)) return true;

  // Google Search local pack spans the main column — don't use Maps left-pane heuristic.
  if (isGoogleSearchPage()) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  const rect = el.getBoundingClientRect();
  return rect.left < window.innerWidth * 0.45 && rect.width < window.innerWidth * 0.55;
}

function collectListingCards(): HTMLElement[] {
  const feed = getResultFeed();
  const cards: HTMLElement[] = [];
  const seen = new Set<string>();

  const addCard = (card: HTMLElement) => {
    const placeId = resolveListingPlaceId(card);
    if (!placeId || seen.has(placeId)) return;
    if (!isInResultsFeed(card)) return;
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

function findMountPoint(card: HTMLElement): HTMLElement {
  if (isGoogleSearchPage()) {
    const searchBlock = card.closest(
      'div.Nv2PK, .VkpGBb, .rllt__details, [data-local-attribute], div[jsname="MZArnb"], div[jsname="Cpkphb"]'
    );
    if (searchBlock instanceof HTMLElement && searchBlock.tagName !== 'A') {
      return searchBlock;
    }
  }

  if (card.tagName !== 'A') {
    const actionRow = card.querySelector('.Rwje5, .qty3Ue, .W6VQef');
    if (actionRow?.parentElement instanceof HTMLElement) {
      return actionRow.parentElement;
    }
    return card;
  }

  const parent = card.parentElement;
  return parent instanceof HTMLElement ? parent : card;
}

function cardPlaceId(card: HTMLElement): string {
  return resolveListingPlaceId(card);
}

function cardListingKeys(card: HTMLElement): {
  placeId: string;
  hexFid: string | null;
  chij: string | null;
  decimalCid: string | null;
} {
  const link = getPlaceLink(card);
  const rawHref = link?.getAttribute('href') ?? link?.getAttribute('data-url') ?? '';
  const hexFid = extractHexFidFromCard(card) ?? extractHexFidFromUrl(rawHref);
  const decimalCid =
    extractDecimalCidFromUrl(rawHref) ??
    card.getAttribute('data-cid') ??
    card.getAttribute('data-rc_ludocids') ??
    card.closest('[data-cid]')?.getAttribute('data-cid') ??
    card.closest('[data-rc_ludocids]')?.getAttribute('data-rc_ludocids') ??
    decimalCidFromHexFid(hexFid);

  return {
    placeId: extractPlaceId(rawHref) || resolveListingPlaceId(card) || rawHref,
    hexFid,
    chij: extractChijFromUrl(rawHref),
    decimalCid,
  };
}

function applyCategoriesToCard(
  card: HTMLElement,
  placeId: string,
  categories: BusinessCategories
): void {
  const businessName = getListItemName(card);
  const sanitized = sanitizeGmbCategories(categories, businessName);
  if (!isPlausibleGmbCategory(sanitized, businessName)) return;
  attachCategoriesWithData(card, placeId, sanitized);
}

function findCategoryMountPoint(card: HTMLElement): { parent: HTMLElement; before: Element | null } {
  if (isGoogleSearchPage()) {
    return findSearchCategoryMount(card);
  }

  const mount = findMountPoint(card);
  const auditWrap = mount.querySelector('.nwf-gbp-audit-wrap');
  return { parent: mount, before: auditWrap };
}

function hasFullCategoryRow(card: HTMLElement, placeId: string): boolean {
  const row = card.querySelector(`[${CATEGORY_ATTR}="${CSS.escape(placeId)}"]`);
  const signature = row?.getAttribute(CATEGORY_SIGNATURE_ATTR) ?? '';
  return signature.includes('\u001f');
}

function showVisibleSearchCategory(
  card: HTMLElement,
  placeId: string,
  businessName: string
): void {
  const category = readSearchCardCategory(card);
  if (!category) return;
  const candidate = { primary: category, secondary: [] as string[] };
  if (!isPlausibleGmbCategory(candidate, businessName)) return;
  applyCategoriesToCard(card, placeId, candidate);
}

function attachCategoriesWithData(
  card: HTMLElement,
  placeId: string,
  categories: BusinessCategories
): void {
  if (!categories.primary?.trim()) return;

  ensureStyles();

  const { parent, before } = findCategoryMountPoint(card);
  if (parent.tagName === 'A') return;

  // Drop rows left behind if a previous pass picked a different mount point.
  card
    .querySelectorAll(`[${CATEGORY_ATTR}="${CSS.escape(placeId)}"]`)
    .forEach((row) => {
      if (row.parentElement !== parent) row.remove();
    });

  mountCategoryRow({
    placeId,
    categories,
    parent,
    before,
    labelText: isGoogleSearchPage() ? 'Categories:' : 'GMB Cat.:',
    isSearchListing: isGoogleSearchPage(),
  });
}

function attachCategories(
  card: HTMLElement,
  placeId: string,
  maps: CategoryLookupMaps | null
): void {
  if (!placeId) return;

  const businessName = getListItemName(card);
  const { hexFid, chij, decimalCid, placeId: listingKey } = cardListingKeys(card);
  const listingPlaceId = chij ?? listingKey;
  const resolvedDecimalCid =
    decimalCid ?? (placeId.startsWith('cid:') ? placeId.slice(4) : null);

  if (isGoogleSearchPage() && !card.querySelector(`[${CATEGORY_ATTR}="${CSS.escape(placeId)}"]`)) {
    showVisibleSearchCategory(card, placeId, businessName);
  }

  if (hasFullCategoryRow(card, placeId)) return;
  if (categoryFetchInFlight.has(placeId)) return;

  // Same path as Maps: bulk JSPB cache when available (Maps results feed).
  if (maps && !isGoogleSearchPage()) {
    const cached = lookupCategoriesFromCache(maps, hexFid, listingPlaceId, resolvedDecimalCid);
    if (cached?.primary && isPlausibleGmbCategory(cached, businessName)) {
      applyCategoriesToCard(card, placeId, cached);
      if ((cached.secondary?.length ?? 0) > 0) return;
    }
  }

  const canFetch =
    Boolean(hexFid) ||
    Boolean(chij) ||
    Boolean(resolvedDecimalCid) ||
    listingPlaceId.startsWith('ChIJ') ||
    placeId.startsWith('cid:');

  if (!canFetch) {
    if (!isGoogleSearchPage()) {
      const lead = extractLeadFromCard(card, placeId, null);
      if (lead?.category && isPlausibleGmbCategory({ primary: lead.category, secondary: [] }, businessName)) {
        applyCategoriesToCard(card, placeId, { primary: lead.category, secondary: [] });
      }
    }
    return;
  }

  categoryFetchInFlight.add(placeId);
  void fetchCategoriesForListing(hexFid, listingPlaceId, {
    decimalCid: resolvedDecimalCid,
    bypassBulkCache: isGoogleSearchPage(),
    timeoutMs: isGoogleSearchPage() ? 12000 : 6000,
  })
    .then((resolved) => {
      if (!resolved?.primary || !isExtensionContextValid()) return;
      applyCategoriesToCard(card, placeId, resolved);
    })
    .finally(() => {
      categoryFetchInFlight.delete(placeId);
    });
}

async function loadCategoryMaps(force = false): Promise<CategoryLookupMaps | null> {
  if (!isExtensionContextValid()) return null;

  if (!categoryFetchPromise) {
    categoryFetchAttempts++;
    categoryFetchPromise = fetchAllCategoriesFromMainWorld({
      force: force || categoryFetchAttempts <= 2,
      timeoutMs: 7000,
      maxAgeMs: force ? 0 : 2500,
    }).finally(() => {
      categoryFetchPromise = null;
    });
  }

  try {
    return await categoryFetchPromise;
  } catch {
    return null;
  }
}

function setButtonState(
  btn: HTMLButtonElement,
  state: 'default' | 'running' | 'done',
  score?: number | null,
  auditedAt?: string | null
): void {
  btn.classList.toggle('is-done', state === 'done');
  btn.classList.toggle('is-stale', state === 'done' && isAuditStale(auditedAt));
  btn.disabled = state === 'running';

  const wrap = btn.closest('.nwf-gbp-audit-wrap');
  const ageEl = wrap?.querySelector<HTMLElement>('.nwf-gbp-audit-age');
  const staleEl = wrap?.querySelector<HTMLElement>('.nwf-gbp-audit-stale-badge');

  if (state === 'running') {
    btn.textContent = 'Auditing…';
    btn.title = 'GBP audit in progress';
    if (ageEl) ageEl.textContent = '';
    staleEl?.classList.remove('visible');
    return;
  }

  if (state === 'done' && typeof score === 'number') {
    btn.textContent = `View Audit (${score})`;
    const ageLabel = formatAuditAge(auditedAt);
    btn.title = ageLabel
      ? `${ageLabel}. Click to view report, or Shift+click to refresh.`
      : 'Open full GBP audit report (Shift+click to refresh)';
    if (ageEl) ageEl.textContent = ageLabel ?? '';
    if (staleEl) staleEl.classList.toggle('visible', isAuditStale(auditedAt));
    return;
  }

  btn.textContent = 'GMB Audit';
  btn.title = 'Run a Google Business Profile audit';
  if (ageEl) ageEl.textContent = '';
  staleEl?.classList.remove('visible');
}

async function loadCachedAudit(
  placeId: string
): Promise<{ score: number | null; auditedAt: string | null }> {
  const res = await safeRuntimeSendMessage<{
    entry?: {
      auditedAt?: string;
      audit?: { score?: number | null; status?: string; auditedAt?: string };
    };
  }>({ type: 'GET_GBP_AUDIT_ENTRY', placeId }, notifyExtensionReloadNeeded);

  if (res?.entry?.audit?.status === 'done' && typeof res.entry.audit.score === 'number') {
    return {
      score: res.entry.audit.score,
      auditedAt: res.entry.audit.auditedAt ?? res.entry.auditedAt ?? null,
    };
  }

  return { score: null, auditedAt: null };
}

function gbpButtonsForPlace(placeId: string): HTMLButtonElement[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(`[${BUTTON_ATTR}="${CSS.escape(placeId)}"]`),
  ];
}

function buildAuditRequest(card: HTMLElement, placeId: string) {
  const lead = extractLeadFromCard(card, placeId, null);
  const href = getPlaceLink(card)?.getAttribute('href') ?? '';
  const rawMapsUrl = getAbsoluteMapsUrl(href);
  const { decimalCid } = cardListingKeys(card);
  const mapsUrl = normalizeMapsAuditUrl(rawMapsUrl || buildMapsUrlFromCid(decimalCid), placeId);

  return {
    placeId,
    name: lead?.name ?? 'Unknown Business',
    mapsUrl,
    category: lead?.category,
    address: lead?.address,
    phone: lead?.phone,
    rating: lead?.rating,
    reviews: lead?.reviews,
    kgMid: readCardKgMid(card) ?? undefined,
  };
}

function buildAuditRequestFromPanel(panel: HTMLElement, placeId: string) {
  const name =
    panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge')?.textContent?.trim() ?? 'Unknown Business';
  const lead = extractLeadFromCard(panel, placeId, null);

  return {
    placeId,
    name: lead?.name ?? name,
    mapsUrl: normalizeMapsAuditUrl(window.location.href, placeId),
    category: lead?.category,
    address: lead?.address,
    phone: lead?.phone,
    rating: lead?.rating,
    reviews: lead?.reviews,
  };
}

function buildAuditRequestFromWrap(wrap: HTMLElement, placeId: string) {
  if (wrap.getAttribute(AUDIT_SCOPE_ATTR) === 'detail') {
    const panel = getBusinessPanel();
    if (panel) return buildAuditRequestFromPanel(panel, placeId);
  }

  const card = wrap.parentElement;
  if (card instanceof HTMLElement) return buildAuditRequest(card, placeId);

  return {
    placeId,
    name: 'Unknown Business',
    mapsUrl: normalizeMapsAuditUrl(window.location.href, placeId),
  };
}

function detailPlaceId(): string | null {
  const href = window.location.href;
  return extractPlaceId(href) ?? extractChijFromUrl(href) ?? null;
}

function handleAuditButtonClick(btn: HTMLButtonElement, event: MouseEvent): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    stopObservers();
    return;
  }

  const placeId = btn.getAttribute(BUTTON_ATTR);
  if (!placeId) return;

  const wrap = btn.closest('.nwf-gbp-audit-wrap') as HTMLElement | null;

  if (auditingPlaceIds.has(placeId)) return;

  const isViewMode =
    !event.shiftKey && btn.classList.contains('is-done') && btn.textContent.startsWith('View Audit');
  if (isViewMode) {
    void safeRuntimeSendMessage({ type: 'OPEN_STANDALONE_AUDIT', placeId }, notifyExtensionReloadNeeded);
    return;
  }

  auditingPlaceIds.add(placeId);
  for (const gbpBtn of gbpButtonsForPlace(placeId)) {
    setButtonState(gbpBtn, 'running');
  }

  const request = wrap
    ? buildAuditRequestFromWrap(wrap, placeId)
    : {
        placeId,
        name: 'Unknown Business',
        mapsUrl: normalizeMapsAuditUrl('', placeId),
      };

  showToast(
    'GBP Audit queued',
    event.shiftKey
      ? ` ${request.name} will open its report when ready.`
      : ` Auditing ${request.name} in the background.`
  );

  void safeRuntimeSendMessage<{ ok?: boolean; error?: string }>(
    { type: 'STANDALONE_GBP_AUDIT', request, openWhenDone: event.shiftKey },
    notifyExtensionReloadNeeded
  ).then((res) => {
    if (res?.ok === false) {
      auditingPlaceIds.delete(placeId);
      for (const gbpBtn of gbpButtonsForPlace(placeId)) {
        setButtonState(gbpBtn, 'default');
      }
      showToast(
        'GBP Audit failed',
        res?.error ? ` ${res.error}` : ' Could not start the audit. Please try again.'
      );
    }
  });
}

/**
 * The search term currently on screen, from Google Search (`?q=`) or Maps
 * (`/maps/search/<term>/`), falling back to the live search box on either.
 */
function readSearchQuery(): string {
  const clean = (value: string): string =>
    value
      .replace(/\+/g, ' ')
      .replace(/\s*\bnear me\b\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const fromParam = new URLSearchParams(window.location.search).get('q');
  if (fromParam) return clean(fromParam);

  const fromMapsPath = window.location.pathname.match(/\/maps\/search\/([^/@]+)/);
  if (fromMapsPath) {
    try {
      return clean(decodeURIComponent(fromMapsPath[1]));
    } catch {
      return clean(fromMapsPath[1]);
    }
  }

  const box = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input#searchboxinput, textarea[name="q"], input[name="q"]'
  );
  return box?.value ? clean(box.value) : '';
}

/**
 * Rank is checked from a map pin, so the keyword should be the service — not the
 * city that was already in the Google search. "plumber islamabad" becomes "plumber".
 */
function rankCheckKeyword(searchQuery: string, category: string, address: string): string {
  const query = searchQuery.trim();
  const cat = category.trim();
  if (cat && query) {
    const q = query.toLowerCase();
    const c = cat.toLowerCase();
    if (q === c || q.startsWith(`${c} `) || q.includes(` ${c} `) || q.endsWith(` ${c}`)) {
      return cat;
    }
  }

  if (query && address) {
    const drop = new Set(
      address
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)
    );
    const kept = query.split(/\s+/).filter((word) => !drop.has(word.toLowerCase()));
    if (kept.length) return kept.join(' ');
  }

  return cat || query;
}

function panelBusinessName(panel: HTMLElement): string {
  return cleanRankCheckBusinessName(
    panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge')?.textContent?.trim() ?? ''
  );
}

async function handleRankCheckButtonClick(btn: HTMLButtonElement): Promise<void> {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    stopObservers();
    return;
  }

  const placeId = btn.getAttribute('data-nwf-rank-check-for');
  if (!placeId) return;

  const wrap = btn.closest('.nwf-gbp-audit-wrap') as HTMLElement | null;
  const isDetail = wrap?.getAttribute(AUDIT_SCOPE_ATTR) === 'detail';
  const panel = getBusinessPanel();

  let card: HTMLElement | null = null;
  if (!isDetail) {
    card =
      (wrap ? getResultCard(wrap) : null) ??
      (wrap?.closest('[data-item-id], .Nv2PK, .VkpGBb, .rllt__link') as HTMLElement | null) ??
      (btn.closest('[data-item-id], .Nv2PK, .VkpGBb, .rllt__link') as HTMLElement | null);
  }

  const lead = card ? extractLeadFromCard(card, placeId, null) : null;
  const panelName = panel ? panelBusinessName(panel) : '';

  let businessName = isDetail
    ? panelName
    : cleanRankCheckBusinessName(lead?.name || (card ? getListItemName(card) : '') || panelName);
  if (!businessName && panelName) businessName = panelName;

  let address = isDetail
    ? cleanRankCheckAddress(extractPanelAddress())
    : cleanRankCheckAddress(lead?.address || extractPanelAddress() || '');
  const businessAge = normalizeBusinessAgeLabel(
    isDetail && panel ? extractBusinessAge(panel) : card ? extractBusinessAge(card) : ''
  );
  const category = (lead?.category || '').trim();
  const keyword = rankCheckKeyword(readSearchQuery(), category, address);

  let latitude: number | undefined;
  let longitude: number | undefined;

  if (card) {
    const keys = cardListingKeys(card);
    const href = getPlaceLink(card)?.getAttribute('href') ?? '';
    const coords = await resolveListingCoordinates(
      { placeId: keys.placeId, hexFid: keys.hexFid, chij: keys.chij, decimalCid: keys.decimalCid },
      { placeUrl: getAbsoluteMapsUrl(href), card, timeoutMs: 5000 }
    );
    if (coords.lat != null && coords.lng != null) {
      latitude = coords.lat;
      longitude = coords.lng;
    }
  }

  if (latitude == null || longitude == null) {
    const fromPlace = parsePlaceUrlLatLng(window.location.href);
    if (fromPlace.lat != null && fromPlace.lng != null) {
      latitude = fromPlace.lat;
      longitude = fromPlace.lng;
    }
  }

  const params: Record<string, string> = {
    name: businessName || 'Unknown Business',
    keyword,
    placeId,
  };
  if (address) params.address = address;
  if (businessAge) params.businessAge = businessAge;
  if (latitude != null && longitude != null) {
    params.lat = String(latitude);
    params.lng = String(longitude);
  }

  void safeRuntimeSendMessage({ type: 'OPEN_RANK_CHECK', params }, notifyExtensionReloadNeeded);
}

function createAuditButtonWrap(placeId: string, scope: 'list' | 'detail'): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'nwf-gbp-audit-wrap';
  wrap.setAttribute(AUDIT_SCOPE_ATTR, scope);
  wrap.setAttribute(AUDIT_PLACE_ATTR, placeId);

  const meta = document.createElement('div');
  meta.className = 'nwf-gbp-audit-meta';

  const btnRow = document.createElement('div');
  btnRow.className = 'nwf-gbp-audit-btn-row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nwf-gbp-audit-btn';
  btn.setAttribute(BUTTON_ATTR, placeId);
  setButtonState(btn, auditingPlaceIds.has(placeId) ? 'running' : 'default');

  // Create Check Rank button
  const rankBtn = document.createElement('button');
  rankBtn.type = 'button';
  rankBtn.className = 'nwf-rank-check-btn';
  rankBtn.setAttribute('data-nwf-rank-check-for', placeId);
  rankBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
      <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/>
    </svg>
    Check Rank
  `;

  btnRow.appendChild(btn);
  btnRow.appendChild(rankBtn);
  meta.appendChild(btnRow);

  const ageEl = document.createElement('span');
  ageEl.className = 'nwf-gbp-audit-age';

  const staleEl = document.createElement('span');
  staleEl.className = 'nwf-gbp-audit-stale-badge';
  staleEl.textContent = 'May be outdated';

  meta.appendChild(ageEl);
  meta.appendChild(staleEl);
  wrap.appendChild(meta);

  void loadCachedAudit(placeId).then(({ score, auditedAt }) => {
    if (!isExtensionContextValid()) return;
    if (score !== null && !auditingPlaceIds.has(placeId)) {
      for (const gbpBtn of gbpButtonsForPlace(placeId)) {
        setButtonState(gbpBtn, 'done', score, auditedAt);
      }
    }
  });

  return wrap;
}

function attachButton(card: HTMLElement, placeId: string): void {
  if (!placeId || !isExtensionContextValid()) return;

  ensureStyles();

  const mount = findMountPoint(card);
  if (mount.tagName === 'A') return;
  if (mount.querySelector(`.nwf-gbp-audit-wrap[${AUDIT_SCOPE_ATTR}="list"]`)) return;

  mount.appendChild(createAuditButtonWrap(placeId, 'list'));
}

function attachDetailPanelButtons(): void {
  if (!isExtensionContextValid()) return;

  const panel = getBusinessPanel();
  if (!panel) return;

  const placeId = detailPlaceId();
  if (!placeId) return;

  ensureStyles();

  const existing = panel.querySelector(
    `.nwf-gbp-audit-wrap[${AUDIT_SCOPE_ATTR}="detail"]`
  ) as HTMLElement | null;
  if (existing?.getAttribute(AUDIT_PLACE_ATTR) === placeId) return;
  existing?.remove();

  document
    .querySelectorAll(`.nwf-gbp-audit-wrap[${AUDIT_SCOPE_ATTR}="detail"]`)
    .forEach((node) => node.remove());

  const { parent, before } = findDetailCategoryInsertPoint(panel);
  const wrap = createAuditButtonWrap(placeId, 'detail');
  if (before) {
    parent.insertBefore(wrap, before);
  } else {
    parent.appendChild(wrap);
  }
}

function injectButtons(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    stopObservers();
    return;
  }

  try {
    const cards = collectListingCards();

    // Render categories immediately. The bulk JSPB cache only exists on Maps,
    // so waiting on it would stall Search until the request times out.
    for (const card of cards) {
      const placeId = cardPlaceId(card);
      if (!placeId) continue;
      attachCategories(card, placeId, null);
    }

    if (!isGoogleSearchPage()) {
      void loadCategoryMaps().then((maps) => {
        if (!isExtensionContextValid()) return;
        for (const card of collectListingCards()) {
          const placeId = cardPlaceId(card);
          if (!placeId) continue;
          attachCategories(card, placeId, maps);
        }
      });
    }

    for (const card of cards) {
      const placeId = cardPlaceId(card);
      if (!placeId) continue;
      attachButton(card, placeId);
    }

    attachDetailPanelButtons();
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      handleInvalidExtensionContext(notifyExtensionReloadNeeded);
      stopObservers();
    }
  }
}

function updateButtonFromAuditEvent(
  placeId: string,
  score: number | null,
  status: string,
  auditedAt?: string | null
): void {
  const buttons = gbpButtonsForPlace(placeId);
  if (buttons.length === 0) return;

  if (status !== 'running') {
    auditingPlaceIds.delete(placeId);
  }

  for (const btn of buttons) {
    if (status === 'running') {
      auditingPlaceIds.add(placeId);
      setButtonState(btn, 'running');
      continue;
    }

    if (status === 'done' && typeof score === 'number') {
      setButtonState(btn, 'done', score, auditedAt);
      continue;
    }

    setButtonState(btn, 'default');
  }
}

function startObservers(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }

  injectButtons();

  bodyObserver = observeDomChanges(document.body, injectButtons, 300);

  const feed = getResultFeed();
  if (feed) {
    feedObserver = observeDomChanges(feed, injectButtons, 250);
    feed.addEventListener('scroll', injectButtons, { passive: true });
  }

  injectIntervalId = window.setInterval(injectButtons, 2500);
}

let gbpAuditStarted = false;

function startGbpAuditFeatures(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }

  if (gbpAuditStarted) {
    injectButtons();
    return;
  }
  gbpAuditStarted = true;

  installInteractionGuard();
  ensureStyles();

  document.addEventListener(
    'click',
    (event) => {
      const btn = (event.target as Element | null)?.closest('.nwf-gbp-audit-btn') as HTMLButtonElement | null;
      if (!btn) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleAuditButtonClick(btn, event);
    },
    true
  );

  // Handle Check Rank button clicks
  document.addEventListener(
    'click',
    (event) => {
      const btn = (event.target as Element | null)?.closest('.nwf-rank-check-btn') as HTMLButtonElement | null;
      if (!btn) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void handleRankCheckButtonClick(btn);
    },
    true
  );

  safeRuntimeOnMessage((message) => {
    if (message.type === 'STANDALONE_GBP_AUDIT_DONE') {
      updateButtonFromAuditEvent(
        message.placeId as string,
        message.score as number | null,
        message.status as string,
        message.auditedAt as string | undefined
      );
    }

    if (message.type === 'AUDIT_QUEUE_UPDATE' && message.queue) {
      const queue = message.queue as {
        running?: { name?: string } | null;
        remainingCount?: number;
        activeCount?: number;
      };
      if ((queue.activeCount ?? 0) === 0) {
        updateQueuePill(null, 0);
      } else {
        updateQueuePill(queue.running?.name ?? null, queue.remainingCount ?? 0);
      }
    }

    if (message.type === 'GBP_AUDIT_COMPLETE') {
      const name = message.name as string;
      const score = message.score as number | null;
      const reportUrl = message.reportUrl as string;
      const scoreLabel = typeof score === 'number' ? ` Score: ${score}/100.` : '';
      showToast(`GBP audit complete`, `${name}.${scoreLabel}`, 8000, {
        label: 'Open report',
        onClick: () => {
          void safeRuntimeSendMessage(
            {
              type: 'OPEN_AUDIT_REPORT',
              key: message.key as string,
              kind: message.kind as 'scan' | 'standalone',
            },
            notifyExtensionReloadNeeded
          );
          if (reportUrl) window.open(reportUrl, '_blank');
        },
      });
    }
  }, notifyExtensionReloadNeeded);

  startObservers();

  window.setTimeout(injectButtons, 800);
  window.setTimeout(injectButtons, 2000);
  window.setTimeout(injectButtons, 5000);
}

function initGbpAudit(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(notifyExtensionReloadNeeded);
    return;
  }
  if (!isGoogleHost()) return;

  onListingToolsActivation(startGbpAuditFeatures);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGbpAudit);
} else {
  initGbpAudit();
}

export {};
