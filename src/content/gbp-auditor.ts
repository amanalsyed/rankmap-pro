import type { BusinessLead } from '../types';
import type { GbpProfileSnapshot } from '../audit/types';
import {
  getText,
  getVisibleText,
  normalizeText,
  sleep,
} from './dom-utils';
import { extractMapsIdentifiersAsync, sanitizePlaceId } from './maps-identifiers';
import { fetchCategoriesForListing, fetchNegativeReviewCountForListing } from './maps-categories-bridge';
import { pickBestCategories, readDetailPanelCategories } from './listing-categories';
import { normalizeMapsText } from './maps-id-utils';
import { extractPanelAddress, extractPanelPhone, getPanelName } from './website-detector';

const GOOGLE_HOSTS = ['google.com', 'goo.gl', 'g.page', 'maps.app.goo.gl', 'business.google.com'];

function isExtensionNode(el: Element): boolean {
  if (el.closest('.nwf-gmb-cat-wrap')) return true;
  if (el.closest('.nwf-gbp-audit-wrap')) return true;
  if (el.closest('[class*="gmb-everywhere"]')) return true;
  if (el.closest('[id^="popupButton"]')) return true;
  if (el.closest('[class*="l1zzyog7_gmb"]')) return true;
  return false;
}

function isExternalWebsiteUrl(href: string): boolean {
  if (!href || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) {
    return false;
  }
  try {
    const url = new URL(href, window.location.origin);
    if (url.hostname.includes('google.com') && url.pathname === '/url') {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url');
      if (target) return isExternalWebsiteUrl(target);
    }
    if (!/^https?:$/i.test(url.protocol)) return false;
    const host = url.hostname.replace(/^www\./, '');
    return !GOOGLE_HOSTS.some((g) => host === g || host.endsWith(`.${g}`));
  } catch {
    return false;
  }
}

function parseNumber(value: string): number | null {
  const n = parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function parseAriaValue(label: string, prefix: RegExp): string {
  return normalizeText(label.replace(prefix, '').trim());
}

function namesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = right.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Root container for the open place detail pane (not the results feed). */
function collectBusinessPanelCandidates(): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const addCandidate = (node: HTMLElement | null) => {
    if (!node || seen.has(node) || node.closest('[role="feed"]')) return;
    seen.add(node);
    candidates.push(node);
  };

  const infoRegions = document.querySelectorAll('[aria-label*="Information for"]');
  for (const info of infoRegions) {
    if (info.closest('[role="feed"]')) continue;

    let node: HTMLElement | null = info as HTMLElement;
    for (let depth = 0; depth < 18 && node; depth++) {
      if (node.querySelector('h1.DUwDvf, h1.fontHeadlineLarge') && node.querySelector('button[role="tab"]')) {
        addCandidate(node);
        break;
      }
      node = node.parentElement;
    }
  }

  const headings = document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge');
  for (const heading of headings) {
    if (heading.closest('[role="feed"]')) continue;
    if (isExtensionNode(heading)) continue;

    // Stop at a container that actually holds detail rows. Stopping at the first
    // ancestor with tabs lands on the header block (h1 + tablist), which contains
    // no address/phone/hours — the reason deep scan read an empty panel.
    let node: HTMLElement | null = heading as HTMLElement;
    let tabsOnly: HTMLElement | null = null;
    let matched = false;
    for (let depth = 0; depth < 20 && node; depth++) {
      const hasInfo = node.querySelector('[aria-label*="Information for"]');
      const hasDetail = node.querySelector('div.OqCZI, [jsaction*="openhours"], [data-item-id]');
      if (hasInfo || hasDetail) {
        addCandidate(node);
        matched = true;
        break;
      }
      if (!tabsOnly && node.querySelector('button[role="tab"][aria-label*="Overview"]')) {
        tabsOnly = node;
      }
      node = node.parentElement;
    }
    if (!matched) addCandidate(tabsOnly);

    const fallback = heading.closest('div.m6QErb');
    if (fallback && !fallback.closest('[role="feed"]')) addCandidate(fallback as HTMLElement);
  }

  return candidates;
}

function panelHeadingName(panel: HTMLElement): string {
  const h1 = panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge');
  if (!h1 || h1.closest('[role="feed"]')) return '';
  return normalizeText(getVisibleText(h1));
}

function getBusinessPanel(): HTMLElement | null {
  const candidates = collectBusinessPanelCandidates();
  if (candidates.length === 0) return null;

  const currentName = getPanelName();
  if (currentName) {
    for (const panel of candidates) {
      const name = panelHeadingName(panel);
      if (name && namesMatch(name, currentName)) return panel;
    }
  }

  return candidates[0];
}

function getDetailRoot(): Element {
  return (getBusinessPanel() ?? document.body) as Element;
}

function queryDetailRoot(selector: string): NodeListOf<Element> {
  const root = getDetailRoot();
  const inRoot = root.querySelectorAll(selector);
  if (inRoot.length > 0) return inRoot;
  return document.querySelectorAll(selector);
}

function pickLongestText(...candidates: string[]): string {
  return candidates
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

function readIo6YTe(el: Element): string {
  return normalizeText(getVisibleText(el.querySelector('.Io6YTe') ?? el));
}

function extractFieldFromContactRow(el: Element, labelPrefix?: RegExp): string {
  const aria = el.getAttribute('aria-label') ?? '';
  const fromAria = labelPrefix ? parseAriaValue(aria, labelPrefix) : aria;
  const io = readIo6YTe(el);
  const visible = normalizeText(getVisibleText(el));
  return pickLongestText(fromAria, io, visible);
}

function findContactElements(dataItemId: string | RegExp): Element[] {
  const matches: Element[] = [];
  const seen = new Set<Element>();

  for (const el of queryDetailRoot('[data-item-id]')) {
    if (isExtensionNode(el)) continue;
    const id = el.getAttribute('data-item-id') ?? '';
    const isMatch = typeof dataItemId === 'string' ? id === dataItemId : dataItemId.test(id);
    if (!isMatch || seen.has(el)) continue;
    seen.add(el);
    matches.push(el);
  }

  if (matches.length === 0) {
    const extraSelectors =
      typeof dataItemId === 'string' && dataItemId === 'authority'
        ? ['a[aria-label^="Website:"]', 'a[data-tooltip="Open website"]', 'a[data-value="Open website"]']
        : typeof dataItemId === 'string' && dataItemId === 'address'
          ? ['button[aria-label*="Address" i]', 'a[aria-label*="Address" i]']
          : typeof dataItemId === 'string' && dataItemId === 'oloc'
            ? ['button[aria-label*="Plus code" i]', 'a[aria-label*="Plus code" i]']
            : [];

    for (const selector of extraSelectors) {
      for (const el of queryDetailRoot(selector)) {
        if (isExtensionNode(el) || seen.has(el)) continue;
        seen.add(el);
        matches.push(el);
      }
    }
  }

  return matches;
}

function getInformationRegion(_panel: HTMLElement): Element {
  const businessName = getPanelName();
  const regions = document.querySelectorAll('[aria-label*="Information for"]');
  for (const region of regions) {
    if (region.closest('[role="feed"]')) continue;
    const label = region.getAttribute('aria-label') ?? '';
    if (!businessName || namesMatch(label, businessName) || label.toLowerCase().includes(businessName.toLowerCase().slice(0, 10))) {
      return region;
    }
  }

  const first = regions[0];
  if (first && !first.closest('[role="feed"]')) return first;

  return getDetailRoot();
}

function extractBusinessName(panel: HTMLElement): string {
  const h1 = panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge');
  if (!h1 || h1.closest('[role="feed"]')) return getPanelName();
  return normalizeText(getVisibleText(h1));
}

function extractAddress(info: Element): string {
  let best = '';

  for (const el of findContactElements('address')) {
    const value = extractFieldFromContactRow(el, /^Address:\s*/i).replace(/^Address:\s*/i, '').trim();
    if (value.length > best.length) best = value;
  }

  if (best.length >= 8) return best;

  for (const el of [info, getDetailRoot()]) {
    const btn = el.querySelector('button[data-item-id="address"], a[data-item-id="address"]');
    if (!btn) continue;
    const value = extractFieldFromContactRow(btn, /^Address:\s*/i).replace(/^Address:\s*/i, '').trim();
    if (value.length > best.length) best = value;
  }

  return best;
}

function getHeaderBlock(panel: HTMLElement): Element {
  const root = getDetailRoot();
  const h1 = root.querySelector('h1.DUwDvf, h1.fontHeadlineLarge') ?? panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge');
  return h1?.closest('.TIHn2') ?? h1?.parentElement ?? panel;
}

function extractPlusCodeFromDocument(): string {
  let best = '';

  for (const el of findContactElements('oloc')) {
    const value = extractFieldFromContactRow(el, /^Plus code:\s*/i).replace(/^Plus code:\s*/i, '').trim();
    if (value.length > best.length) best = value;
  }

  return best;
}

function extractPhone(info: Element): string {
  let best = '';

  for (const el of findContactElements(/^phone/)) {
    const href = (el.getAttribute('href') ?? '').replace(/^tel:/i, '');
    const value = pickLongestText(
      href,
      extractFieldFromContactRow(el, /^Phone:\s*/i).replace(/^Phone:\s*/i, '')
    );
    if (value.length > best.length) best = value;
  }

  if (best) return best;

  const btn = info.querySelector('button[data-item-id^="phone"], a[data-item-id^="phone"]');
  if (!btn) return '';
  const href = (btn.getAttribute('href') ?? '').replace(/^tel:/i, '');
  return pickLongestText(
    href,
    extractFieldFromContactRow(btn, /^Phone:\s*/i).replace(/^Phone:\s*/i, '')
  );
}

function websiteFromAuthorityEl(el: Element): { website: string; hasWebsite: boolean } | null {
  const href = el.getAttribute('href') ?? '';
  if (isExternalWebsiteUrl(href)) {
    try {
      return { website: new URL(href, window.location.origin).href, hasWebsite: true };
    } catch {
      return { website: href, hasWebsite: true };
    }
  }

  const aria = el.getAttribute('aria-label') ?? '';
  const domainFromAria = aria.match(/Website:\s*([^\s,]+)/i)?.[1]?.trim();
  if (domainFromAria) {
    const url = domainFromAria.startsWith('http') ? domainFromAria : `https://${domainFromAria}`;
    if (isExternalWebsiteUrl(url)) return { website: url, hasWebsite: true };
  }

  const io = readIo6YTe(el);
  if (io && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(io)) {
    const url = io.startsWith('http') ? io : `https://${io.replace(/^\/+/, '')}`;
    if (isExternalWebsiteUrl(url)) return { website: url, hasWebsite: true };
  }

  return null;
}

function extractWebsite(panel: HTMLElement): { website: string; hasWebsite: boolean } {
  for (const el of findContactElements('authority')) {
    const found = websiteFromAuthorityEl(el);
    if (found) return found;
  }

  const info = getInformationRegion(panel);
  for (const el of info.querySelectorAll('a[data-item-id="authority"], button[data-item-id="authority"], a.CsEnBe[href]')) {
    if (isExtensionNode(el)) continue;
    const found = websiteFromAuthorityEl(el);
    if (found) return found;
  }

  for (const el of queryDetailRoot('a[data-tooltip="Open website"][href], a[data-value="Open website"][href]')) {
    if (isExtensionNode(el)) continue;
    const href = el.getAttribute('href') ?? '';
    if (isExternalWebsiteUrl(href)) {
      try {
        return { website: new URL(href, window.location.origin).href, hasWebsite: true };
      } catch {
        return { website: href, hasWebsite: true };
      }
    }
  }

  const addWebsite = panel.querySelector('[jsaction*="suggestWebsiteEdit"]');
  if (addWebsite) {
    const label = normalizeText(getVisibleText(addWebsite));
    if (/add website/i.test(label)) return { website: '', hasWebsite: false };
  }

  return { website: '', hasWebsite: false };
}

function extractHeaderRatingReviews(header: Element): { rating: number | null; count: number | null } {
  const f7 = header.querySelector('.F7nice');
  if (!f7) return { rating: null, count: null };

  let rating: number | null = null;
  const hiddenRating = f7.querySelector(':scope > span > span[aria-hidden="true"]');
  if (hiddenRating) rating = parseNumber(getText(hiddenRating));

  const starLabel = f7.querySelector('[aria-label*="stars"]')?.getAttribute('aria-label') ?? '';
  const starMatch = starLabel.match(/([\d.]+)\s*stars?/i);
  if (starMatch) rating = parseFloat(starMatch[1]);

  let count: number | null = null;
  const reviewLabel = f7.querySelector('[aria-label*="review"]')?.getAttribute('aria-label') ?? '';
  const reviewMatch = reviewLabel.match(/([\d,]+)\s*reviews?/i);
  if (reviewMatch) count = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

  if (count === null) {
    const uy7 = f7.querySelector('.UY7F9');
    const m = getText(uy7).match(/([\d,]+)/);
    if (m) count = parseInt(m[1].replace(/,/g, ''), 10);
  }

  return { rating, count };
}

function parseNegativeCountFromStarRows(rows: NodeListOf<Element> | Element[]): number | null {
  let negative = 0;
  let parsedAny = false;

  for (const row of rows) {
    const label = row.getAttribute('aria-label') ?? '';
    const starMatch = label.match(/^(\d)\s+stars?/i);
    const countMatch = label.match(/,\s*([\d,]+)\s+reviews?/i);
    if (!starMatch || !countMatch) continue;

    parsedAny = true;
    const stars = parseInt(starMatch[1], 10);
    const count = parseInt(countMatch[1].replace(/,/g, ''), 10);
    if (stars === 1 || stars === 2) negative += count;
  }

  return parsedAny ? negative : null;
}

function extractNegativeReviewCountFromDom(panel: HTMLElement): number | null {
  const scopes = [
    panel.querySelector('.PPCwl.cYOgid, .PPCwl'),
    panel.querySelector('[role="region"][aria-label*="Reviews" i]'),
    panel,
  ].filter(Boolean) as Element[];

  for (const scope of scopes) {
    const rows = scope.querySelectorAll('tr.BHOKXe[aria-label*="stars"]');
    const negative = parseNegativeCountFromStarRows(rows);
    if (negative !== null) return negative;
  }

  return null;
}

function extractReviewSummary(panel: HTMLElement): {
  rating: number | null;
  count: number | null;
  negativeReviewCount: number | null;
} {
  const block = panel.querySelector('.PPCwl.cYOgid, .PPCwl');
  if (!block) {
    return { rating: null, count: null, negativeReviewCount: extractNegativeReviewCountFromDom(panel) };
  }

  const rating = parseNumber(getText(block.querySelector('.fontDisplayLarge')));
  let count: number | null = null;

  const reviewBtn = block.querySelector('.GQjSyb, button[jsaction*="moreReviews"]');
  if (reviewBtn) {
    const m = getVisibleText(reviewBtn).match(/([\d,]+)\s*reviews?/i);
    if (m) count = parseInt(m[1].replace(/,/g, ''), 10);
  }

  const starRows = block.querySelectorAll('tr.BHOKXe[aria-label*="stars"]');
  const negativeFromBlock = parseNegativeCountFromStarRows(starRows);

  if (count === null && starRows.length > 0) {
    let total = 0;
    starRows.forEach((row) => {
      const label = row.getAttribute('aria-label') ?? '';
      const m = label.match(/,\s*([\d,]+)\s+reviews?/i);
      if (m) total += parseInt(m[1].replace(/,/g, ''), 10);
    });
    if (total > 0) count = total;
  }

  return {
    rating,
    count,
    negativeReviewCount: negativeFromBlock ?? extractNegativeReviewCountFromDom(panel),
  };
}

function pickBestReviews(
  header: { rating: number | null; count: number | null },
  summary: { rating: number | null; count: number | null; negativeReviewCount: number | null }
): { rating: number | null; count: number | null; negativeReviewCount: number | null } {
  return {
    rating: header.rating ?? summary.rating,
    count: header.count ?? summary.count,
    negativeReviewCount: summary.negativeReviewCount,
  };
}

function extractCategories(header: Element, panel: HTMLElement): { primary: string; secondary: string[] } {
  const categories: string[] = [];

  const addUnique = (value: string) => {
    const clean = normalizeText(value);
    if (!clean || clean.length > 80) return;
    if (/^(add a label|add website|suggest|find more)/i.test(clean)) return;
    if (!categories.includes(clean)) categories.push(clean);
  };

  header.querySelectorAll('button.DkEaL[jsaction*="category"]').forEach((btn) => {
    if (isExtensionNode(btn)) return;
    addUnique(getVisibleText(btn));
  });

  panel.querySelectorAll('button.DkEaL[jsaction*="category"]').forEach((btn) => {
    if (isExtensionNode(btn)) return;
    if (!header.contains(btn)) addUnique(getVisibleText(btn));
  });

  return { primary: categories[0] ?? '', secondary: categories.slice(1) };
}

const HOURS_TOGGLE_SELECTOR =
  '[jsaction*="openhours"][aria-expanded], ' +
  '.OqCZI [role="button"][aria-expanded], ' +
  '[role="button"][aria-expanded].OMl5r';

const HOURS_CONTENT_SELECTOR =
  'button[jsaction*="openhours"][data-value], ' +
  'button[data-tooltip="Copy open hours"], ' +
  'div.t39EBf button[data-value], ' +
  'div.t39EBf table.eK4R0e tr.y0skZc, ' +
  'table.eK4R0e tr.y0skZc, ' +
  'tr.y0skZc li.G8aQO';

const WEEKDAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * Background audit tabs are not laid out — getBoundingClientRect() is zero for every
 * node, so the visibility filter throws away all hours markup. Relax on hidden docs.
 */
function shouldUseRelaxedHoursExtraction(): boolean {
  if (typeof document !== 'undefined' && document.hidden) return true;
  return /\/maps\/place\//i.test(window.location.pathname);
}

/** Panels Maps has swapped out stay in the DOM with no layout box — skip them. */
function isRendered(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  return el.getClientRects().length > 0;
}

/** Region test with no visibility check — see isLiveHoursContent for why. */
function isInLiveRegion(el: Element): boolean {
  if (el.closest('[role="feed"]')) return false;
  if (isExtensionNode(el)) return false;
  return true;
}

function isLiveDetailNode(el: Element): boolean {
  return isInLiveRegion(el) && isRendered(el);
}

/**
 * Maps keeps each row's "copy open hours" button display:none until the row is
 * hovered, so a layout-box test on the leaf node throws away the exact data we
 * want. Judge staleness by the enclosing hours block instead.
 */
function isLiveHoursContent(node: Element): boolean {
  if (!isInLiveRegion(node)) return false;
  if (shouldUseRelaxedHoursExtraction()) return true;
  const block = node.closest('div.OqCZI');
  if (block) return isRendered(block);
  const host = node.closest('table, [data-item-id="oh"]') ?? node.parentElement ?? node;
  return isRendered(host);
}

function isHoursAnchorLive(block: Element): boolean {
  if (!isInLiveRegion(block)) return false;
  if (shouldUseRelaxedHoursExtraction()) return true;
  return isRendered(block);
}

/**
 * The hours block holds both the toggle and the weekly table, so it anchors the
 * search far more reliably than the panel container: on search-result pages the
 * panel lookup can land on the header block (h1 + tabs), which has no hours at all.
 */
function findHoursBlocks(): Element[] {
  const blocks: Element[] = [];
  const seen = new Set<Element>();

  const push = (el: Element | null) => {
    if (!el) return;
    const block = el.closest('div.OqCZI') ?? el.parentElement ?? el;
    if (seen.has(block) || !isHoursAnchorLive(block)) return;
    seen.add(block);
    blocks.push(block);
  };

  document.querySelectorAll('div.OqCZI').forEach((el) => push(el));
  document.querySelectorAll(HOURS_TOGGLE_SELECTOR).forEach((el) => push(el));
  document.querySelectorAll(HOURS_CONTENT_SELECTOR).forEach((el) => push(el));
  document
    .querySelectorAll('[data-item-id="oh"], [aria-label*="Show open hours" i], [jsaction*="openhours"]')
    .forEach((el) => push(el));

  return blocks;
}

/** Scopes to search for hours, most specific first. */
function getHoursScopes(preferred?: Element | null): Element[] {
  const scopes: Element[] = [];
  const seen = new Set<Element>();

  const push = (el: Element | null | undefined) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    scopes.push(el);
  };

  findHoursBlocks().forEach(push);
  if (preferred && !preferred.closest('[role="feed"]')) push(preferred);
  push(getBusinessPanel());
  push(document.querySelector('[role="main"]'));
  push(getDetailRoot());
  push(document.body);

  return scopes;
}

/** Search-result panels don't always expose the aria-expanded dropdown variant. */
const HOURS_TOGGLE_FALLBACK_SELECTOR =
  '[jsaction*="openhours"], [aria-label*="Show open hours" i], ' +
  '[data-item-id="oh"], .OqCZI [role="button"], .OqCZI [tabindex="0"]';

function findHoursToggle(): HTMLElement | null {
  for (const selector of [HOURS_TOGGLE_SELECTOR, HOURS_TOGGLE_FALLBACK_SELECTOR]) {
    for (const block of findHoursBlocks()) {
      const inBlock = block.querySelector<HTMLElement>(selector);
      if (inBlock && isInLiveRegion(inBlock)) return inBlock;
      if (block instanceof HTMLElement && block.matches(selector)) return block;
    }
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (shouldUseRelaxedHoursExtraction() ? isInLiveRegion(el) : isLiveDetailNode(el)) return el;
    }
  }
  return null;
}

function hasRenderedHoursContent(): boolean {
  for (const node of document.querySelectorAll(HOURS_CONTENT_SELECTOR)) {
    if (isLiveHoursContent(node)) return true;
  }
  return false;
}

/** Wait until the hours toggle has rendered in the open panel. */
export async function waitForHoursSectionReady(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (findHoursToggle()) return true;
    await sleep(200);
  }
  return Boolean(findHoursToggle());
}

async function expandHoursSection(): Promise<void> {
  let toggle = findHoursToggle();
  const appearDeadline = Date.now() + 8000;
  while (!toggle && Date.now() < appearDeadline) {
    await sleep(200);
    toggle = findHoursToggle();
  }
  if (!toggle) return;

  // Re-resolve the toggle each pass: Maps replaces the node while the panel
  // settles, so a stale reference silently swallows the click.
  const expandDeadline = Date.now() + 6000;
  while (Date.now() < expandDeadline) {
    if (hasRenderedHoursContent()) break;

    const live = findHoursToggle() ?? toggle;
    if (live.getAttribute('aria-expanded') !== 'true') live.click();

    await sleep(200);
  }

  await sleep(250);
}

function extractHours(info: Element): { hours: string; specialHours: string } {
  const WEEKDAY = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  let fallback: { hours: string; specialHours: string } = { hours: '', specialHours: '' };

  for (const scope of getHoursScopes(info)) {
    const result = extractHoursFromScope(scope);
    if (!result.hours.trim()) continue;
    // A day-by-day breakdown always beats the "Open now" summary line.
    if (WEEKDAY.test(result.hours)) return result;
    if (!fallback.hours) fallback = result;
  }

  if (!fallback.hours.trim()) {
    for (const scope of getHoursScopes(info)) {
      const raw = extractHoursFromRawMarkup(scope);
      if (raw.hours.trim()) {
        if (WEEKDAY.test(raw.hours)) return raw;
        if (!fallback.hours) fallback = raw;
      }
    }
  }

  if (!fallback.hours.trim()) {
    const embedded = extractHoursFromEmbeddedScripts();
    if (embedded.hours.trim()) return embedded;
  }

  return fallback;
}

function extractHoursFromScope(scope: Element): { hours: string; specialHours: string } {
  const parts: string[] = [];
  const DAY_PATTERN = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;

  const isValidHoursEntry = (val: string): boolean => {
    if (!val || val.length < 5) return false;
    if (val.toLowerCase().startsWith('suggest')) return false;
    return DAY_PATTERN.test(val) || /\d+\s*(am|pm)/i.test(val);
  };

  // Ignore leftovers from previously opened panels and the results feed.
  const q = <T extends Element>(selector: string): T[] =>
    Array.from(scope.querySelectorAll<T>(selector)).filter(isLiveHoursContent);

  // ── Strategy 1: buttons with jsaction containing "openhours" ──────────────
  q<HTMLElement>('button[jsaction*="openhours"][data-value]').forEach((btn) => {
    const val = normalizeText(btn.getAttribute('data-value') ?? '');
    if (isValidHoursEntry(val)) parts.push(val);
  });

  if (parts.length >= 5) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 2: buttons with data-tooltip="Copy open hours" ───────────────
  if (parts.length === 0) {
    q<HTMLElement>('button[data-tooltip="Copy open hours"][data-value]').forEach((btn) => {
      const val = normalizeText(btn.getAttribute('data-value') ?? '');
      if (isValidHoursEntry(val)) parts.push(val);
    });
  }

  if (parts.length >= 5) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 3: buttons inside div.t39EBf ─────────────────────────────────
  if (parts.length === 0) {
    q<HTMLElement>('div.t39EBf button[data-value]').forEach((btn) => {
      const val = normalizeText(btn.getAttribute('data-value') ?? '');
      if (isValidHoursEntry(val)) parts.push(val);
    });
  }

  if (parts.length >= 5) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 4: read from button aria-label containing "Copy open hours" ──
  if (parts.length === 0) {
    q<HTMLElement>('button[aria-label*="Copy open hours"]').forEach((btn) => {
      const ariaLabel = btn.getAttribute('aria-label') ?? '';
      const cleaned = ariaLabel.replace(/,?\s*copy open hours$/i, '').trim();
      if (isValidHoursEntry(cleaned)) parts.push(cleaned);
    });
  }

  if (parts.length >= 5) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 5: read from table rows via td.mxowUb aria-label ─────────────
  if (parts.length === 0) {
    const rowContainers = [
      ...q<Element>('div.t39EBf table.eK4R0e'),
      ...q<Element>('table.eK4R0e, table.WgFkxc'),
      ...q<Element>('.OqCZI table'),
    ];

    for (const table of rowContainers) {
      const rows = table.querySelectorAll<HTMLElement>('tr.y0skZc, tr');
      rows.forEach((row) => {
        const dayEl = row.querySelector<HTMLElement>('.ylH6lf');
        if (!dayEl) return;
        const day = (
          (dayEl.firstElementChild as HTMLElement)?.textContent ??
          dayEl.textContent ??
          ''
        ).trim();

        const hoursCell = row.querySelector<HTMLElement>('td.mxowUb');
        if (!hoursCell) return;
        const aria = hoursCell.getAttribute('aria-label') ?? '';
        const hoursText = aria
          .replace(/,?\s*copy open hours$/i, '')
          .replace(/,?\s*hours might differ$/i, '')
          .trim();

        if (day && hoursText) parts.push(`${day}: ${hoursText}`);
      });

      if (parts.length >= 5) break;
      if (parts.length > 0) break;
    }
  }

  if (parts.length > 0) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 6: read visible text from li.G8aQO in hours table rows ───────
  q<HTMLElement>('tr.y0skZc').forEach((row) => {
    const dayEl = row.querySelector<HTMLElement>('.ylH6lf');
    const timeEl = row.querySelector<HTMLElement>('li.G8aQO');
    if (!dayEl || !timeEl) return;
    const day = normalizeText(dayEl.textContent ?? '');
    const time = normalizeText(timeEl.textContent ?? '');
    if (day && time) parts.push(`${day}: ${time}`);
  });

  if (parts.length > 0) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  // ── Strategy 7: summary text ("Open · Closes 5 PM") ───────────────────────
  const summaryEl =
    q<HTMLElement>('.OqCZI .MkV9 .ZDu9vd')[0] ??
    q<HTMLElement>('.MkV9 .ZDu9vd')[0];
  const summaryText = summaryEl ? normalizeText(getVisibleText(summaryEl)) : '';

  return { hours: summaryText, specialHours: '' };
}

/** Last resort: read data-value / aria-label hours from markup without visibility checks. */
function extractHoursFromRawMarkup(scope: Element): { hours: string; specialHours: string } {
  const parts: string[] = [];
  const DAY_PATTERN = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const isValidHoursEntry = (val: string): boolean => {
    if (!val || val.length < 5) return false;
    if (val.toLowerCase().startsWith('suggest')) return false;
    return DAY_PATTERN.test(val) || /\d+\s*(am|pm)/i.test(val);
  };

  const roots: Element[] = [scope, document.body];
  for (const root of roots) {
    root.querySelectorAll<HTMLElement>('button[jsaction*="openhours"][data-value]').forEach((btn) => {
      if (!isInLiveRegion(btn)) return;
      const val = normalizeText(btn.getAttribute('data-value') ?? '');
      if (isValidHoursEntry(val)) parts.push(val);
    });
    root.querySelectorAll<HTMLElement>('button[data-tooltip="Copy open hours"][data-value]').forEach((btn) => {
      if (!isInLiveRegion(btn)) return;
      const val = normalizeText(btn.getAttribute('data-value') ?? '');
      if (isValidHoursEntry(val)) parts.push(val);
    });
    root.querySelectorAll<HTMLElement>('button[aria-label*="Copy open hours"]').forEach((btn) => {
      if (!isInLiveRegion(btn)) return;
      const cleaned = (btn.getAttribute('aria-label') ?? '')
        .replace(/,?\s*copy open hours$/i, '')
        .trim();
      if (isValidHoursEntry(cleaned)) parts.push(cleaned);
    });
    if (parts.length > 0) break;
  }

  if (parts.length > 0) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  return { hours: '', specialHours: '' };
}

/** Parse weekday hours embedded in Maps script / protobuf blobs. */
function extractHoursFromEmbeddedScripts(): { hours: string; specialHours: string } {
  const parts: string[] = [];
  const seen = new Set<string>();

  const addPart = (day: string, time: string) => {
    const entry = `${day}: ${time}`.trim();
    const key = entry.toLowerCase();
    if (!entry || seen.has(key)) return;
    seen.add(key);
    parts.push(entry);
  };

  const sources: string[] = [];
  try {
    const state = (window as unknown as { APP_INITIALIZATION_STATE?: unknown }).APP_INITIALIZATION_STATE;
    if (state) sources.push(JSON.stringify(state));
  } catch {
    // ignore
  }

  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent ?? '';
    if (text.length < 80 || !/monday|tuesday|openhours|open hours/i.test(text)) continue;
    sources.push(text.slice(0, 500_000));
  }

  for (const blob of sources) {
    for (const day of WEEKDAY_NAMES) {
      const label = day.charAt(0).toUpperCase() + day.slice(1);
      const patterns = [
        new RegExp(`"${label}"\\s*,\\s*"([^"]{3,80})"`, 'gi'),
        new RegExp(`${label}\\s*[:\\u2013\\u2014-]\\s*([0-9]{1,2}(?::\\d{2})?\\s*[AP]M[^",\\]]{0,40})`, 'gi'),
        new RegExp(`${label}\\s*,\\s*"([^"]{3,80})"`, 'gi'),
      ];
      for (const re of patterns) {
        let match: RegExpExecArray | null;
        while ((match = re.exec(blob)) !== null) {
          const time = normalizeText(match[1] ?? '');
          if (time && !/^closed$/i.test(time)) addPart(label, time);
        }
      }
    }
    if (parts.length >= 3) break;
  }

  if (parts.length > 0) {
    return { hours: parts.join('; '), specialHours: '' };
  }

  return { hours: '', specialHours: '' };
}

/** Dump what the hours DOM actually looked like when extraction came back empty. */
function logHoursDiagnostics(): void {
  try {
    const blocks = document.querySelectorAll('div.OqCZI');
    const values = document.querySelectorAll<HTMLElement>('button[data-value]');
    console.warn('[NWF hours] extraction returned nothing', {
      url: window.location.href,
      panelName: getPanelName(),
      oqcziBlocks: blocks.length,
      toggles: document.querySelectorAll(HOURS_TOGGLE_SELECTOR).length,
      toggleFallbacks: document.querySelectorAll(HOURS_TOGGLE_FALLBACK_SELECTOR).length,
      dataValueButtons: values.length,
      sampleDataValues: Array.from(values)
        .slice(0, 3)
        .map((btn) => btn.getAttribute('data-value')),
      hourRows: document.querySelectorAll('tr.y0skZc').length,
      hourTables: document.querySelectorAll('table.eK4R0e').length,
      hoursBlockHtml: blocks[0]?.outerHTML.slice(0, 600) ?? null,
    });
  } catch {
    // diagnostics must never break a scrape
  }
}

async function scrapeHoursWithRetry(scope: Element): Promise<{ hours: string; specialHours: string }> {
  const relaxed = shouldUseRelaxedHoursExtraction();
  if (relaxed) {
    await waitForHoursSectionReady(12000);
    await sleep(800);
  }

  await expandHoursSection();
  await sleep(relaxed ? 700 : 300);
  let result = extractHours(scope);

  if (!result.hours?.trim()) {
    await sleep(relaxed ? 1500 : 800);
    await expandHoursSection();
    await sleep(relaxed ? 900 : 400);
    result = extractHours(scope);
  }

  if (!result.hours?.trim()) {
    result = extractHoursFromRawMarkup(scope);
  }

  if (!result.hours?.trim()) {
    result = extractHoursFromEmbeddedScripts();
  }

  if (!result.hours?.trim()) logHoursDiagnostics();

  return result;
}

function normalizeExternalHref(href: string): string {
  if (!href || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) {
    return '';
  }
  try {
    const url = new URL(href, window.location.origin);
    if (url.hostname.includes('google.com') && url.pathname === '/url') {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url');
      if (target) return normalizeExternalHref(target);
    }
    if (!/^https?:$/i.test(url.protocol)) return '';
    if (!isExternalWebsiteUrl(url.href)) return '';
    return url.href;
  } catch {
    return href.startsWith('http') ? href : '';
  }
}

/** Booking / appointment link row below opening hours on the Overview tab. */
function extractBookingLink(info: Element): string {
  const selectors = [
    // data-item-id based selectors
    'a[data-item-id="action:3"][href]',
    'a[data-item-id^="action:"][href]',
    'a.CsEnBe[data-item-id="action:3"][href]',
    'a.CsEnBe[data-item-id^="action:"][href]',
    // Tooltip-based selectors
    'a[data-tooltip="Open booking link"][href]',
    'a[data-tooltip*="booking"][href]',
    // Aria-label based selectors
    'a[aria-label="Open booking link"][href]',
    'a[aria-label*="booking" i][href]',
    // data-value based selectors
    'a[data-value="Open booking link"][href]',
    'a[data-value*="booking" i][href]',
    // Nested link inside booking section
    '.RcCsl a[data-tooltip*="booking"][href]',
    '.RcCsl a[aria-label*="booking" i][href]',
  ];

  const roots: Array<Element | Document> = [info, getDetailRoot(), document];
  for (const root of roots) {
    for (const selector of selectors) {
      for (const el of root.querySelectorAll(selector)) {
        if (isExtensionNode(el)) continue;
        const href = normalizeExternalHref(el.getAttribute('href') ?? '');
        if (href) return href;
      }
    }
  }

  return '';
}

/** Services link in the Overview tab (links to external services page). */
function extractServicesLink(info: Element): string {
  const selectors = [
    // data-item-id based selectors
    'a[data-item-id="services"][href]',
    'a.CsEnBe[data-item-id="services"][href]',
    // Tooltip-based selectors
    'a[data-tooltip="Open services link"][href]',
    'a[data-tooltip*="services"][href]',
    // Aria-label based selectors
    'a[aria-label="Open services link"][href]',
    'a[aria-label*="services" i][href]',
    // data-value based selectors
    'a[data-value="Open services link"][href]',
    'a[data-value*="services" i][href]',
    // Nested link inside services section
    '.RcCsl a[data-tooltip*="services"][href]',
    '.RcCsl a[aria-label*="services" i][href]',
  ];

  const roots: Array<Element | Document> = [info, getDetailRoot(), document];
  for (const root of roots) {
    for (const selector of selectors) {
      for (const el of root.querySelectorAll(selector)) {
        if (isExtensionNode(el)) continue;
        const href = normalizeExternalHref(el.getAttribute('href') ?? '');
        if (href) return href;
      }
    }
  }

  return '';
}

function getPhotosSection(panel: HTMLElement): HTMLElement | null {
  for (const header of panel.querySelectorAll('h2.kPvgOb.fontHeadlineSmall, h2.kPvgOb')) {
    if (/photos?\s*&\s*videos?|photos?/i.test(getText(header))) {
      const section = header.closest('div.m6QErb');
      if (section instanceof HTMLElement) return section;
    }
  }
  return null;
}

function getOwnerPostsSection(panel: HTMLElement): Element | null {
  for (const header of panel.querySelectorAll(
    'div.fontHeadlineSmall.zSdcRe.PiF0we, div.fontHeadlineSmall.PiF0we, div.PiF0we'
  )) {
    if (/from the owner/i.test(getText(header))) {
      return header.closest('div.S3NLN') ?? header.parentElement;
    }
  }

  return panel.querySelector('div.S3NLN');
}

function parsePostDateText(raw: string): string {
  const clean = normalizeText(raw);
  if (!clean || clean.length > 80) return '';

  if (/^(?:just now|today|yesterday)$/i.test(clean)) return clean;

  const patterns = [
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i,
    /(?:a|an|\d+)\s+(?:second|minute|hour|day|week|month|year|mo|mos|mon|yr|yrs)s?\.?\s+ago/i,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) return normalizeText(match[0]);
  }

  return '';
}

function looksLikePostDate(text: string): boolean {
  return parsePostDateText(text).length > 0;
}

function extractDateFromPostCard(card: Element): string {
  const selectors = [
    'div.fontBodyMedium.lqMB',
    'div.lqMB',
    'div.mgX1W.fontBodySmall div',
    'div.mgX1W div',
  ];

  for (const selector of selectors) {
    for (const el of card.querySelectorAll(selector)) {
      const date = parsePostDateText(getText(el));
      if (date) return date;
    }
  }

  const fromCard = parsePostDateText(getVisibleText(card));
  if (fromCard) return fromCard;

  return '';
}

function extractLatestPostDateFromLatestPostsCards(panel: HTMLElement): string {
  for (const card of panel.querySelectorAll('div.cKbrCd')) {
    const date = extractDateFromPostCard(card);
    if (date) return date;

    const dateEl = card.querySelector('div.mgX1W.fontBodySmall div, div.mgX1W div');
    const fromEl = parsePostDateText(getText(dateEl));
    if (fromEl) return fromEl;
  }

  return '';
}

function extractLatestPostDateFromOwnerPosts(panel: HTMLElement): string {
  const ownerSection = getOwnerPostsSection(panel);
  const roots: ParentNode[] = ownerSection ? [ownerSection] : [];
  const overviewPosts = panel.querySelector('div.Q7eoI');
  if (overviewPosts) roots.unshift(overviewPosts);

  for (const root of roots) {
    const cards = root.querySelectorAll(
      'div.SBD2Rc.waIsr[aria-label*="See local posts" i], div.SBD2Rc.waIsr[aria-label*="local posts" i], div.SBD2Rc[jsaction*="local-post"], div.SBD2Rc[jsaction*="localPost"]'
    );
    for (const card of cards) {
      const date = extractDateFromPostCard(card);
      if (date) return date;
    }
  }

  for (const card of panel.querySelectorAll('div.SBD2Rc.waIsr[aria-label*="local posts" i]')) {
    const date = extractDateFromPostCard(card);
    if (date) return date;
  }

  return '';
}

function extractLatestPostDate(panel: HTMLElement): string {
  const fromOwnerPost = extractLatestPostDateFromOwnerPosts(panel);
  if (fromOwnerPost) return fromOwnerPost;

  const fromLatestCards = extractLatestPostDateFromLatestPostsCards(panel);
  if (fromLatestCards) return fromLatestCards;

  for (const header of panel.querySelectorAll('h2.kPvgOb.fontTitleSmall, h2.kPvgOb')) {
    if (!/latest posts?/i.test(getText(header))) continue;

    const section = header.closest('div.m6QErb') ?? header.parentElement;
    const dateEl =
      section?.querySelector('div.cKbrCd div.mgX1W.fontBodySmall div') ??
      section?.querySelector('div.mgX1W.fontBodySmall div');
    const date = parsePostDateText(getText(dateEl));
    if (date) return date;
  }

  for (const el of panel.querySelectorAll('div.lqMB, div.fontBodyMedium.lqMB, div.mgX1W div')) {
    if (el.closest('.jftiEf, [role="feed"]')) continue;
    const date = parsePostDateText(getText(el));
    if (date) return date;
  }

  return '';
}

async function scrollPostsSectionIntoView(panel: HTMLElement): Promise<void> {
  for (const header of panel.querySelectorAll(
    'h2.kPvgOb, div.fontHeadlineSmall.zSdcRe.PiF0we, div.fontHeadlineSmall.PiF0we'
  )) {
    const text = getText(header);
    if (!/latest posts?|from the owner/i.test(text)) continue;
    header.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(400);
    return;
  }
}

function hasLatestPostsSection(panel: HTMLElement): boolean {
  for (const header of panel.querySelectorAll('h2.kPvgOb.fontTitleSmall, h2.kPvgOb')) {
    if (!/latest posts?/i.test(getText(header))) continue;
    const section = header.closest('div.m6QErb') ?? header.parentElement;
    if (section?.querySelector('div.cKbrCd, div.Rfb4Xc, div.oHJe9')) return true;
  }
  return false;
}

function extractLatestPhotoDate(panel: HTMLElement): string {
  const roots: ParentNode[] = [];
  const photosSection = getPhotosSection(panel);
  if (photosSection) roots.push(photosSection);
  roots.push(panel);

  for (const root of roots) {
    for (const btn of root.querySelectorAll('button.K4UgGe[aria-label*="Latest" i]')) {
      const aria = normalizeText(btn.getAttribute('aria-label') ?? '');
      const fromDelimiter = aria.match(/^latest\s*[·•\u00b7\-–—]\s*(.+)$/i);
      if (fromDelimiter?.[1] && looksLikePostDate(fromDelimiter[1])) {
        return normalizeText(fromDelimiter[1]);
      }
    }

    for (const tile of root.querySelectorAll('div.ofKBgf')) {
      const labels = [...tile.querySelectorAll('span.zaTlhd')].map((el) => normalizeText(getText(el)));
      if (!labels.some((text) => /^latest$/i.test(text))) continue;

      for (const text of labels) {
        if (/^latest$/i.test(text)) continue;
        if (looksLikePostDate(text)) return text;
      }
    }
  }

  return '';
}

function extractPhotoSignals(panel: HTMLElement): boolean {
  const section = getPhotosSection(panel);
  if (section) {
    const hasCarousel = Boolean(
      section.querySelector('div.fp2VUc[role="region"], div.fp2VUc[aria-label*="Photos of" i]')
    );
    const hasThumbs = section.querySelectorAll('button.K4UgGe img.DaSXdd, img.DaSXdd').length > 0;
    if (hasCarousel || hasThumbs) return true;
  }

  if (panel.querySelector('button[aria-label*="See photos" i], .YNB9Sd button')) return true;
  return false;
}

async function extractPhotoSignalsAsync(
  panel: HTMLElement
): Promise<{ hasPhotos: boolean; latestPhotoDate: string }> {
  await scrollDetailPanel(panel);
  return {
    hasPhotos: extractPhotoSignals(panel),
    latestPhotoDate: extractLatestPhotoDate(panel),
  };
}

function extractPostsFromOverview(panel: HTMLElement): boolean | null {
  if (panel.querySelector('div.Q7eoI div.SBD2Rc.waIsr[aria-label*="local posts" i]')) {
    return true;
  }

  const section = getOwnerPostsSection(panel);
  if (!section) return null;

  const posts = section.querySelectorAll(
    'div.SBD2Rc.waIsr[aria-label*="local posts" i], div.SBD2Rc[jsaction*="local-post"], div.SBD2Rc[jsaction*="localPost"]'
  );
  if (posts.length > 0) return true;

  return null;
}

async function extractPostSignals(
  panel: HTMLElement
): Promise<{ hasPosts: boolean | null; latestPostDate: string }> {
  await clickPlaceTab(panel, 'Overview');
  await scrollDetailPanel(panel);
  await scrollPostsSectionIntoView(panel);
  await sleep(400);

  let latestPostDate = extractLatestPostDate(panel);
  const fromOwner = extractPostsFromOverview(panel);
  if (fromOwner === true) {
    return { hasPosts: true, latestPostDate };
  }
  if (hasLatestPostsSection(panel)) {
    return { hasPosts: true, latestPostDate };
  }

  const tabs = panel.querySelectorAll<HTMLElement>('button[role="tab"]');
  for (const tab of tabs) {
    const label = `${tab.getAttribute('aria-label') ?? ''} ${getVisibleText(tab)}`.toLowerCase();
    if (!/posts?|updates?/.test(label)) continue;

    if (tab.getAttribute('aria-selected') !== 'true') {
      tab.click();
      await sleep(1000);
      await scrollDetailPanel(panel);
      await scrollPostsSectionIntoView(panel);
    }

    const text = normalizeText(getVisibleText(getDetailRoot() as HTMLElement));
    const date = extractLatestPostDate(panel);
    if (date) latestPostDate = date;
    const tabPosts = getDetailRoot().querySelectorAll(
      'div.SBD2Rc.waIsr, div.cKbrCd, div.Rfb4Xc'
    );

    if (/no updates|no posts|hasn't posted|has not posted|nothing here/i.test(text)) {
      return { hasPosts: false, latestPostDate: date || latestPostDate };
    }
    if (tabPosts.length > 0 || date || latestPostDate) {
      return { hasPosts: true, latestPostDate: date || latestPostDate };
    }
    return { hasPosts: true, latestPostDate: date || latestPostDate };
  }

  if (latestPostDate) return { hasPosts: true, latestPostDate };
  return { hasPosts: fromOwner, latestPostDate };
}

function extractClaimedStatus(root: ParentNode, signals?: { hasWebsite?: boolean; hasReviews?: boolean }): boolean | null {
  if (root.querySelector('[aria-label*="Claim this business" i], [data-value="Claim this business"]')) {
    return false;
  }
  if (
    root.querySelector(
      '[aria-label*="Suggest an edit" i], button[data-value="Suggest an edit"], [jsaction*="suggestEdit"]'
    )
  ) {
    return true;
  }
  if (signals?.hasWebsite || signals?.hasReviews) return true;
  return null;
}

function extractBusinessStatus(
  root: ParentNode,
  hasWebsite: boolean,
  claimed: boolean | null,
  hasReviews: boolean
): string {
  if (claimed === false) return 'Unclaimed';

  const isClaimed =
    claimed === true ||
    Boolean(
      root.querySelector('[aria-label*="Suggest an edit" i], button[data-value="Suggest an edit"]')
    );

  if (isClaimed) {
    if (hasWebsite) return 'Claimed & Live';
    if (root.querySelector('[jsaction*="suggestWebsiteEdit"]')) return 'Claimed — No Website Listed';
    return 'Claimed';
  }

  if (hasWebsite && hasReviews) return 'Live — Verified Listing';
  if (hasWebsite) return 'Active';
  if (hasReviews) return 'Live on Google Maps';
  if (root.querySelector('[jsaction*="suggestWebsiteEdit"]')) return 'Claimed — No Website Listed';
  return hasWebsite ? 'Active' : 'No Website Listed';
}

async function clickPlaceTab(panel: HTMLElement, tabName: 'Overview' | 'About'): Promise<boolean> {
  const tabs = panel.querySelectorAll<HTMLElement>('button[role="tab"]');
  let tab: HTMLElement | null = null;

  for (const candidate of tabs) {
    const label = `${candidate.getAttribute('aria-label') ?? ''} ${getVisibleText(candidate)}`;
    if (label.toLowerCase().includes(tabName.toLowerCase())) {
      tab = candidate;
      break;
    }
  }

  if (!tab) {
    tab = panel.querySelector<HTMLElement>(`button[role="tab"][aria-label*="${tabName}"]`);
  }

  if (!tab) return false;
  if (tab.getAttribute('aria-selected') === 'true') return true;

  tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  tab.click();
  await sleep(900);
  return tab.getAttribute('aria-selected') === 'true';
}

async function ensureOverviewTab(panel: HTMLElement): Promise<void> {
  const alreadyOnOverview = panel.querySelector(
    'button[role="tab"][aria-selected="true"][aria-label*="Overview" i]'
  );
  await clickPlaceTab(panel, 'Overview');
  if (!alreadyOnOverview) await sleep(500);
}

async function scrollDetailPanel(panel: HTMLElement): Promise<void> {
  const scrollables = [
    panel,
    ...panel.querySelectorAll<HTMLElement>('.m6QErb.DxyBCb, [role="main"], [role="region"]'),
  ];
  for (const el of scrollables) {
    el.scrollTop = el.scrollHeight;
  }
  await sleep(500);
}

function getAboutTabRegion(panel: HTMLElement): Element | null {
  const businessName = getPanelName();
  const regions = document.querySelectorAll('[role="region"][aria-label*="About" i], [aria-label*="About " i]');

  for (const region of regions) {
    if (region.closest('[role="feed"]')) continue;
    if (!panel.contains(region) && !getDetailRoot().contains(region)) continue;

    const label = region.getAttribute('aria-label') ?? '';
    if (
      !businessName ||
      namesMatch(label, businessName) ||
      /about\b/i.test(label)
    ) {
      return region;
    }
  }

  const inPanel = panel.querySelector('[role="region"][aria-label*="About" i], [aria-label*="About " i]');
  if (inPanel) return inPanel;

  return document.querySelector('[role="region"][aria-label*="About" i]');
}

function aboutRegionHasAttributes(region: Element | null): boolean {
  if (!region) return false;
  return Boolean(
    region.querySelector(
      'div.iP2t7d li, [class*="iP2t7d"] li, ul.ZQ6we li, li[aria-label], [role="listitem"]'
    )
  );
}

async function scrollAboutRegion(region: Element | null): Promise<void> {
  if (!region) return;
  let node: Element | null = region;
  while (node) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 20) {
      node.scrollTop = node.scrollHeight;
    }
    node = node.parentElement;
  }
  await sleep(350);
}

async function clickAboutTab(panel: HTMLElement): Promise<Element | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const clicked = await clickPlaceTab(panel, 'About');
    if (!clicked && attempt < 2) {
      await clickPlaceTab(panel, 'Overview');
      await sleep(400);
      continue;
    }

    await scrollDetailPanel(panel);

    const started = Date.now();
    while (Date.now() - started < 9000) {
      const region = getAboutTabRegion(panel);
      await scrollAboutRegion(region);

      if (aboutRegionHasAttributes(region)) return region;

      const aboutSelected = panel.querySelector(
        'button[role="tab"][aria-selected="true"][aria-label*="About" i]'
      );
      if (aboutSelected && region && Date.now() - started > 2000) {
        return region;
      }

      await sleep(350);
    }

    await clickPlaceTab(panel, 'Overview');
    await sleep(500);
  }

  return getAboutTabRegion(panel);
}

function extractAttributeLabel(item: Element): string {
  const ariaOnItem = item.getAttribute('aria-label') ?? '';
  if (ariaOnItem.length >= 2) {
    return normalizeText(
      ariaOnItem
        .replace(/^Offers\s+/i, '')
        .replace(/^Has\s+/i, '')
        .replace(/^Accepts\s+/i, '')
        .replace(/\s+available$/i, '')
    );
  }

  const labeled = item.querySelector('span[aria-label]:not([aria-hidden="true"])');
  if (labeled) {
    const visible = normalizeText(getVisibleText(labeled));
    if (visible.length >= 2) return visible;

    const aria = labeled.getAttribute('aria-label') ?? '';
    const cleaned = normalizeText(
      aria
        .replace(/^Offers\s+/i, '')
        .replace(/^Has\s+/i, '')
        .replace(/^Accepts\s+/i, '')
        .replace(/\s+available$/i, '')
    );
    if (cleaned.length >= 2) return cleaned;
  }

  const row = item.querySelector('.iNvpkb, .fontBodyMedium');
  const fromRow = normalizeText(getVisibleText(row ?? item));
  if (fromRow.length >= 2) return fromRow;

  return normalizeText(getVisibleText(item));
}

const ATTRIBUTE_SECTION_HINT =
  /service options|offerings|payments|accessibility|amenities|planning|crowd|from the business|highlights/i;

const SERVICE_SECTION_HINT =
  /^services?$|offerings|products?\s*(?:and|&)\s*services?|what (?:this|we) offer|popular services/i;

function collectAttributeScopes(panel: HTMLElement, aboutRegion: Element | null): Element[] {
  // Use all available scopes from most-specific to broadest.
  // The cross-form dedup in extractAboutAttributes / extractAttributesFromScope
  // ensures nested scopes don't produce "Category: X" + bare "X" duplicates.
  const scopes: Element[] = [];
  const seen = new Set<Element>();

  const add = (el: Element | null) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    scopes.push(el);
  };

  add(aboutRegion);
  add(getAboutTabRegion(panel));
  add(getDetailRoot());
  add(panel);

  return scopes;
}

/** Group attributes by their "Category: " prefix for readability.
 *  ["Accessibility: A", "Accessibility: B", "Payments: X"]
 *    → ["Accessibility: A, B", "Payments: X"] */
function groupAttributesByCategory(attrs: string[]): string[] {
  const order: string[] = []; // category names in first-seen order
  const groups = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const attr of attrs) {
    const colonIdx = attr.indexOf(':');
    if (colonIdx > 0) {
      const cat = attr.slice(0, colonIdx).trim();
      const val = attr.slice(colonIdx + 1).trim();
      if (!groups.has(cat)) {
        groups.set(cat, []);
        order.push(cat);
      }
      groups.get(cat)!.push(val);
    } else {
      ungrouped.push(attr);
    }
  }

  const result: string[] = [];
  for (const cat of order) {
    const vals = groups.get(cat) ?? [];
    result.push(vals.length === 1 ? `${cat}: ${vals[0]}` : `${cat}: ${vals.join(', ')}`);
  }
  result.push(...ungrouped);
  return result;
}

const ATTRIBUTE_ARIA_HINT =
  /^(Offers|Has|Accepts|Provides|Requires|Welcomes|Identifies|Language|Online|On-?site|Wheelchair|Assistive|Gender|LGBTQ|Veteran|Minority|Black-?owned|Women-?owned|Family-?owned)/i;

function extractAttributesFromScope(scope: Element): string[] {
  const attributes: string[] = [];
  const seen = new Set<string>();

  /** Block both "Category: Label" and bare "Label" forms so we never add the
   *  same attribute twice with and without a category prefix. */
  const markSeen = (clean: string) => {
    const key = clean.toLowerCase();
    seen.add(key);
    // If this is "Category: Label", also mark "label" as seen so later bare
    // passes don't duplicate it.
    const colonIdx = key.indexOf(':');
    if (colonIdx > 0) {
      const bare = key.slice(colonIdx + 1).trimStart();
      if (bare.length >= 2) seen.add(bare);
    }
  };

  const add = (value: string) => {
    const clean = normalizeText(value);
    if (!clean || clean.length < 2 || clean.length > 120) return;
    if (/^(add a label|add website|suggest|find more|see more|view all|write a review)/i.test(clean)) {
      return;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    markSeen(clean);
    attributes.push(clean);
  };

  const addFromAria = (raw: string) => {
    const clean = normalizeText(
      raw
        .replace(/^Offers\s+/i, '')
        .replace(/^Has\s+/i, '')
        .replace(/^Accepts\s+/i, '')
        .replace(/\s+available$/i, '')
    );
    if (clean.length >= 2) add(clean);
  };

  // ── Pass 1: Structured About-tab sections (div.iP2t7d with titled h2 groups) ──
  scope.querySelectorAll('div.iP2t7d, [class*="iP2t7d"]').forEach((section) => {
    if (isExtensionNode(section)) return;
    if (section.closest('[role="feed"], .jftiEf, .PPCwl')) return;

    const titleEl =
      section.querySelector('h2.iL3Qke, h2.fontTitleSmall, h2[class*="fontTitle"]') ??
      section.querySelector('h2');
    const title = normalizeText(getText(titleEl));
    const items = section.querySelectorAll(
      'ul.ZQ6we li, li.hpLkke, li[role="listitem"], li[aria-label]'
    );

    items.forEach((item) => {
      if (isExtensionNode(item)) return;
      const label = extractAttributeLabel(item);
      if (!label) return;
      add(title && ATTRIBUTE_SECTION_HINT.test(title) ? `${title}: ${label}` : label);
    });
  });

  // ── Pass 2: h2-titled groups (Maps class obfuscation may omit iP2t7d) ──
  scope.querySelectorAll('h2.iL3Qke, h2.fontTitleSmall, h2[class*="fontTitle"], h2').forEach((h2) => {
    if (isExtensionNode(h2)) return;
    const title = normalizeText(getText(h2));
    if (!title || !ATTRIBUTE_SECTION_HINT.test(title)) return;

    const container = h2.closest('div') ?? h2.parentElement;
    if (!container) return;

    container.querySelectorAll('li, [role="listitem"]').forEach((item) => {
      if (isExtensionNode(item)) return;
      if (item.closest('[role="feed"], .jftiEf, .PPCwl')) return;
      const label = extractAttributeLabel(item);
      if (label) add(`${title}: ${label}`);
    });
  });

  // ── Pass 3: aria-labelled list items — only if passes 1+2 produced nothing ──
  // (prevents duplicate bare "Label" when we already have "Category: Label")
  if (attributes.length === 0) {
    scope.querySelectorAll('li[aria-label], [role="listitem"][aria-label]').forEach((item) => {
      if (isExtensionNode(item)) return;
      if (item.closest('[role="feed"], .jftiEf, .PPCwl')) return;
      const aria = item.getAttribute('aria-label') ?? '';
      if (ATTRIBUTE_ARIA_HINT.test(aria)) addFromAria(aria);
    });

    // Generic list items in attribute lists
    scope.querySelectorAll('ul.ZQ6we li, li.hpLkke, li[role="listitem"]').forEach((item) => {
      if (isExtensionNode(item)) return;
      if (item.closest('[role="feed"], .jftiEf, .PPCwl')) return;
      const label = extractAttributeLabel(item);
      if (label) add(label);
    });

    // Last resort: aria-label hints
    scope.querySelectorAll('[aria-label]').forEach((el) => {
      if (isExtensionNode(el)) return;
      if (el.closest('[role="feed"], .jftiEf, .PPCwl, button[role="tab"]')) return;
      const aria = el.getAttribute('aria-label') ?? '';
      if (ATTRIBUTE_ARIA_HINT.test(aria)) addFromAria(aria);
    });
  }

  return attributes;
}

function extractAboutAttributes(panel: HTMLElement, aboutRegion: Element | null): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const scope of collectAttributeScopes(panel, aboutRegion)) {
    for (const attr of extractAttributesFromScope(scope)) {
      const key = attr.toLowerCase();
      if (seen.has(key)) continue;
      // Also block the bare form to avoid "Category: X" + "X" duplicates
      // across different scopes
      seen.add(key);
      const colonIdx = key.indexOf(':');
      if (colonIdx > 0) seen.add(key.slice(colonIdx + 1).trimStart());
      merged.push(attr);
    }
  }

  return groupAttributesByCategory(merged).slice(0, 50);
}

function extractServicesFromScope(scope: Element): string[] {
  const services: string[] = [];
  const seen = new Set<string>();

  const add = (value: string) => {
    const clean = normalizeText(value);
    if (!clean || clean.length < 2 || clean.length > 120) return;
    if (/^(add a|suggest|see more|find more|view all)/i.test(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    services.push(clean);
  };

  scope.querySelectorAll('div.iP2t7d, [class*="iP2t7d"]').forEach((section) => {
    if (isExtensionNode(section)) return;
    if (section.closest('[role="feed"]')) return;

    const titleEl =
      section.querySelector('h2.iL3Qke, h2.fontTitleSmall, h2[class*="fontTitle"]') ??
      section.querySelector('h2');
    const title = normalizeText(getText(titleEl));

    if (!SERVICE_SECTION_HINT.test(title)) return;

    section.querySelectorAll('ul.ZQ6we li, li.hpLkke, li[role="listitem"]').forEach((item) => {
      if (isExtensionNode(item)) return;
      const label = extractAttributeLabel(item);
      if (label) add(label);
    });
  });

  return services;
}

function extractAboutServices(_panel: HTMLElement, aboutRegion: Element | null): string[] {
  // Only look inside the About tab region (or the detail root as fallback).
  // Searching the full panel picks up navigation text and other UI chrome.
  const scope = aboutRegion ?? getAboutTabRegion(_panel) ?? getDetailRoot();
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const service of extractServicesFromScope(scope)) {
    const key = service.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(service);
  }

  return merged.slice(0, 80);
}

function extractAboutContent(_panel: HTMLElement, aboutRegion: Element | null): {
  secondaryCategories: string[];
  attributes: string[];
} {
  const scope = aboutRegion ?? getDetailRoot();
  const categories: string[] = [];
  const attributes = extractAboutAttributes(_panel, aboutRegion);

  scope.querySelectorAll('button.DkEaL[jsaction*="category"]').forEach((btn) => {
    if (isExtensionNode(btn)) return;
    const cat = normalizeText(getVisibleText(btn));
    if (cat && !categories.includes(cat)) categories.push(cat);
  });

  return {
    secondaryCategories: categories.slice(1),
    attributes,
  };
}

async function waitForPlaceUrlData(timeoutMs = 10000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const href = normalizeMapsText(window.location.href);
    if (/!3d-?\d/.test(href) && (/!19sChIJ|place_id=ChIJ|!1s0x/i.test(href) || /\/[gm]\//i.test(href))) {
      return;
    }
    await sleep(300);
  }
}

async function waitForPanelReady(_expectedName: string, timeoutMs = 12000): Promise<boolean> {
  // The deep-scan flow already waited for the panel to switch before calling
  // runGbpAudit / scrapeGbpProfile.  Here we just make sure detail content
  // has finished loading inside the already-open panel.
  const { panelHasDetailContent } = await import('./website-detector');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (panelHasDetailContent()) return true;
    await sleep(200);
  }
  return panelHasDetailContent();
}

export function checkGbpPanelReady(expectedName: string): boolean {
  const panel = getBusinessPanel();
  const name = panel ? extractBusinessName(panel) : getPanelName();
  const hasDetail = Boolean(
    document.querySelector(
      '[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"], [data-item-id="oloc"], [data-item-id="oh"], a[aria-label^="Website:"]'
    )
  );
  if (!name || !hasDetail) return false;
  if (!expectedName.trim()) return true;
  return namesMatch(name, expectedName);
}

export async function scrapeGbpProfile(lead: BusinessLead): Promise<Partial<GbpProfileSnapshot>> {
  const mapsUrl = lead.mapsUrl || window.location.href;

  await waitForPanelReady(lead.name);
  await waitForPlaceUrlData(6000);
  await sleep(300);

  // Try to get the panel container — retry up to 3 times if not found
  let panel = getBusinessPanel();
  if (!panel) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(500);
      panel = getBusinessPanel();
      if (panel) break;
    }
  }

  // Even if panel is null, continue with document-level extraction for hours etc.
  // Only return early if we truly can't extract anything useful.
  if (!panel) {
    const { hours } = await scrapeHoursWithRetry(document.body);


    const ids = await extractMapsIdentifiersAsync();
    return {
      name: lead.name,
      mapsUrl,
      placeId: sanitizePlaceId(ids.placeId) ?? sanitizePlaceId(lead.id) ?? ids.placeId ?? lead.id,
      cid: ids.cid,
      knowledgeGraphId: ids.knowledgeGraphId ?? '',
      businessProfileId: ids.businessProfileId,
      hexFid: ids.hexFid ?? '',
      lat: ids.lat,
      lng: ids.lng,
      hours, // Include hours even without panel!
      hasWebsite: false,
    };
  }

  const ids = await extractMapsIdentifiersAsync(panel);

  await ensureOverviewTab(panel);

  const detailRoot = getDetailRoot();
  const header = getHeaderBlock(panel);
  const info = getInformationRegion(panel);
  const { website, hasWebsite } = extractWebsite(panel);
  const headerReviews = extractHeaderRatingReviews(header);
  const summaryReviews = extractReviewSummary(panel);
  const reviews = pickBestReviews(headerReviews, summaryReviews);
  let { primary: primaryCategory, secondary: secondaryCategories } = extractCategories(header, panel);

  const categoriesPromise = fetchCategoriesForListing(ids.hexFid, ids.placeId, {
    timeoutMs: 7000,
    decimalCid: ids.cid ?? null,
  });
  const negativePromise = fetchNegativeReviewCountForListing(ids.hexFid, ids.placeId, {
    timeoutMs: 5000,
    decimalCid: ids.cid ?? null,
  });

  const hoursScope = panel ?? info;
  const { hours, specialHours } = await scrapeHoursWithRetry(hoursScope);
  const bookingLink = extractBookingLink(info);
  const servicesLink = extractServicesLink(info);
  const plusCode = extractPlusCodeFromDocument();
  const hasReviews = (reviews.count ?? 0) > 0;
  const claimed = extractClaimedStatus(detailRoot, { hasWebsite, hasReviews });
  const businessStatus = extractBusinessStatus(detailRoot, hasWebsite, claimed, hasReviews);
  const { hasPhotos, latestPhotoDate } = await extractPhotoSignalsAsync(panel);
  const { hasPosts, latestPostDate } = await extractPostSignals(panel);

  let aboutRegion = await clickAboutTab(panel);
  // Always scroll after tab open — attribute sections load progressively as
  // the region scrolls into view. Don't skip this even when 1 attribute exists.
  await scrollDetailPanel(panel);
  await scrollAboutRegion(aboutRegion);
  await sleep(600);
  let about = extractAboutContent(panel, aboutRegion);

  // Retry when we have fewer than 3 attributes (might have caught a partial load)
  if (about.attributes.length < 3) {
    await scrollDetailPanel(panel);
    await scrollAboutRegion(aboutRegion);
    await sleep(700);
    about = extractAboutContent(panel, aboutRegion);
  }

  if (about.attributes.length === 0) {
    await clickPlaceTab(panel, 'Overview');
    await sleep(400);
    aboutRegion = await clickAboutTab(panel);
    await scrollDetailPanel(panel);
    await scrollAboutRegion(aboutRegion);
    await sleep(900);
    about = extractAboutContent(panel, aboutRegion);
  }

  let services = extractAboutServices(panel, aboutRegion);
  if (services.length === 0) {
    await clickPlaceTab(panel, 'Overview');
    await sleep(400);
    await scrollDetailPanel(panel);
    services = extractAboutServices(panel, null);
  }

  const jspbCategories = await categoriesPromise;
  const panelCategories = readDetailPanelCategories();

  const resolvedCategories = pickBestCategories([jspbCategories, panelCategories]);

  if (resolvedCategories?.primary) {
    primaryCategory = resolvedCategories.primary;
    secondaryCategories = resolvedCategories.secondary;
  } else {
    const domCategories = extractCategories(header, panel);
    if (domCategories.primary) {
      primaryCategory = domCategories.primary;
      secondaryCategories = domCategories.secondary;
    }
  }

  await waitForPlaceUrlData(2500);
  const finalIds = await extractMapsIdentifiersAsync(panel);

  const resolvedPlaceId =
    sanitizePlaceId(finalIds.placeId ?? ids.placeId) ??
    sanitizePlaceId(lead.id) ??
    finalIds.placeId ??
    ids.placeId ??
    lead.id;

  const jspbNegativeCount = await negativePromise;
  const negativeReviewCount = jspbNegativeCount ?? reviews.negativeReviewCount;

  return {
    name: extractBusinessName(panel) || lead.name,
    address: extractAddress(info) || extractPanelAddress() || lead.address,
    phone: extractPhone(info) || extractPanelPhone() || lead.phone,
    website,
    hasWebsite,
    claimed,
    lat: finalIds.lat ?? ids.lat,
    lng: finalIds.lng ?? ids.lng,
    placeId: resolvedPlaceId,
    cid: finalIds.cid ?? ids.cid,
    knowledgeGraphId: finalIds.knowledgeGraphId ?? ids.knowledgeGraphId ?? '',
    businessProfileId: finalIds.businessProfileId ?? ids.businessProfileId,
    hexFid: finalIds.hexFid ?? ids.hexFid ?? '',
    mapsUrl,
    primaryCategory: primaryCategory || '',
    secondaryCategories,
    hours,
    specialHours,
    bookingLink,
    servicesLink,
    services,
    attributes: about.attributes,
    serviceAreas: [],
    reviewCount: reviews.count ?? (lead.reviews ? parseInt(String(lead.reviews).replace(/\D/g, ''), 10) : null),
    negativeReviewCount,
    rating: reviews.rating ?? (lead.rating ? parseNumber(lead.rating) : null),
    photoCount: null,
    hasPhotos,
    latestPhotoDate,
    postCount: null,
    hasPosts,
    latestPostDate,
    plusCode,
    businessStatus,
  };
}

export async function extractOpenPanelAttributes(): Promise<string[]> {
  const panel = getBusinessPanel();
  if (!panel) return [];

  const aboutSelected = panel.querySelector(
    'button[role="tab"][aria-selected="true"][aria-label*="About" i]'
  );
  let aboutRegion = getAboutTabRegion(panel);

  if (!aboutSelected) {
    aboutRegion = await clickAboutTab(panel);
    await sleep(500);
  }

  await scrollAboutRegion(aboutRegion);
  await scrollDetailPanel(panel);
  await sleep(400);

  return extractAboutAttributes(panel, aboutRegion);
}

export async function runGbpAudit(lead: BusinessLead): Promise<Partial<GbpProfileSnapshot>> {
  return scrapeGbpProfile(lead);
}
