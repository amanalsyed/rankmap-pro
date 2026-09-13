import type { BusinessLead } from '../types';
import { emptyContactFields } from '../types';
import { cleanBusinessName, stripGoogleAdUiNodes } from '../utils/business-name';
import {
  extractPlaceId,
  getPlaceLink,
  getText,
  getVisibleText,
  normalizeText,
  sleep,
} from './dom-utils';
import { isGoogleSearchPage } from './search-dom-utils';

const GOOGLE_HOSTS = [
  'google.com',
  'goo.gl',
  'g.page',
  'maps.app.goo.gl',
  'business.google.com',
];

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

/**
 * On Google Search the action links (Website / Directions) are siblings of the
 * text column, so scope every field read to the listing shell. Without this,
 * reads are either empty (scoped too tight) or borrowed from a neighbouring
 * listing (scoped too wide).
 */
function resolveListingScope(card: Element): Element {
  if (!isGoogleSearchPage()) return card;
  return card.closest('.VkpGBb') ?? card.querySelector('.VkpGBb') ?? card;
}

/**
 * Detect a Website action on a Maps list card or detail panel.
 */
export function cardHasWebsite(card: Element): boolean {
  return elementHasWebsiteLink(resolveListingScope(card));
}

/** Detect website link on the open Maps business detail panel. */
export function panelHasWebsite(panel: Element): boolean {
  return elementHasWebsiteLink(panel);
}

function elementHasWebsiteLink(root: Element): boolean {
  // Specific selectors for website elements in Google Maps
  const selectors = [
    'a[data-value="Website"]',
    'a[data-value="website"]',
    'a[data-value="Open website"]',
    'a[data-tooltip="Open website"]',
    'a[aria-label^="Website:"]',
    'button[data-value="Website"]',
    // data-item-id="authority" is the website button in Google Maps detail panel
    '[data-item-id="authority"]',
  ];

  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      // Skip "add website" suggestions
      const aria = el.getAttribute('aria-label') ?? '';
      const text = normalizeText(getText(el as HTMLElement));
      if (/add website|suggest.*website|claim this/i.test(`${aria} ${text}`)) continue;
      
      // Check if it has a valid external href
      const href = el.getAttribute('href') ?? '';
      if (href && isExternalWebsiteUrl(href)) return true;
      
      // Or if it's labeled as website without href (button style)
      const dataValue = el.getAttribute('data-value') ?? '';
      if (/^website$/i.test(dataValue)) return true;
    }
  }

  // Check for elements with "Website" text that have external links
  for (const el of root.querySelectorAll('a[href]')) {
    const text = normalizeText(getText(el as HTMLElement));
    const href = el.getAttribute('href') ?? '';
    
    // Only match if the text is exactly "Website" and has external URL
    if (/^website$/i.test(text) && isExternalWebsiteUrl(href)) {
      return true;
    }
  }

  return false;
}

const HOURS_PATTERN =
  /^(open|closed|closes|opens|open 24 hours?|open 24 hrs?|open 24 h|open now|closed now|temporarily closed|open until\b.*|opens?\s+\d.*|closes?\s+\d.*)$/i;

function isHoursText(value: string): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  return HOURS_PATTERN.test(text);
}

function isPriceText(value: string): boolean {
  return /^\$+$/.test(normalizeText(value));
}

function extractPhone(value: string): string {
  const text = normalizeText(value);
  const match = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+\d[\d\s().-]{8,}\d/
  );
  return match ? normalizeText(match[0]) : '';
}

function stripPhone(value: string): string {
  const phone = extractPhone(value);
  if (!phone) return normalizeText(value);
  return normalizeText(value.replace(phone, '').replace(/[·•|,]+$/g, ''));
}

function splitMetaParts(value: string): string[] {
  return normalizeText(value)
    .split(/\s*[·•|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unglueHours(value: string): { category: string; hours: string } {
  const text = normalizeText(value);
  const glued = text.match(
    /^(.*?)(open\s*24\s*hours?|open\s*24\s*hrs?|open now|closed now|temporarily closed|open until\s+.+|closes?\s+.+|opens?\s+.+)$/i
  );
  if (glued?.[1] && glued[2] && glued[1].length > 1) {
    return { category: normalizeText(glued[1]), hours: normalizeText(glued[2]) };
  }
  return { category: text, hours: '' };
}

function parseRatingFromAria(aria: string): string {
  // Maps: "4.9 stars" — Search: "Rated 5.0 out of 5, 144 user reviews"
  const match =
    aria.match(/([\d.]+)\s*stars?/i) ??
    aria.match(/rated\s+([\d.]+)\s+out of/i) ??
    aria.match(/([\d.]+)\s*out of\s*5/i);
  return match?.[1] ?? '';
}

/** Expand Google's abbreviated counts, e.g. "1.1K" -> 1100. */
function expandCount(raw: string): string {
  const match = raw.match(/^([\d.,]+)\s*([KkMm])?$/);
  if (!match) return '';
  const value = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return '';
  const scale = match[2]?.toLowerCase() === 'k' ? 1_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return String(Math.round(value * scale));
}

function parseReviewsCount(text: string): string {
  const paren = text.match(/\(\s*([\d.,]+\s*[KkMm]?)\s*\)/);
  if (paren) {
    const expanded = expandCount(paren[1].trim());
    if (expanded) return expanded;
  }
  // "144 reviews" and "144 user reviews" / "144 Google reviews"
  const labeled = text.match(/([\d.,]+\s*[KkMm]?)(?:\s+\w+)?\s+reviews?/i);
  if (labeled) {
    const expanded = expandCount(labeled[1].trim());
    if (expanded) return expanded;
  }
  return '';
}

export function getAbsoluteMapsUrl(href: string): string {
  if (!href) return '';

  let resolved = href;
  try {
    const url = new URL(href, window.location.origin);
    if (url.hostname.includes('google.com') && url.pathname === '/url') {
      resolved = url.searchParams.get('q') ?? url.searchParams.get('url') ?? href;
    } else if (!href.startsWith('http')) {
      resolved = `https://www.google.com${href}`;
    }
  } catch {
    if (!href.startsWith('http')) resolved = `https://www.google.com${href}`;
  }

  // Preserve ?cid= / ?q=place_id links — stripping the query breaks audit URLs.
  if (/[?&](?:cid=\d+|q=place_id:)/i.test(resolved)) {
    return resolved.startsWith('http') ? resolved : `https://www.google.com${resolved}`;
  }

  return resolved.split('?')[0];
}

export function getListItemName(card: HTMLElement): string {
  const nameEl = card.querySelector(
    '.qBF1Pd, .fontHeadlineSmall, [class*="fontHeadlineSmall"], span.xxVWCe, .OSrXXb, .dbg0pd, span[role="heading"]'
  );
  const placeLink = getPlaceLink(card);
  const raw =
    getListingNameText(nameEl) ||
    normalizeText(placeLink?.getAttribute('aria-label')?.replace(/^Map of\s+/i, '') ?? '') ||
    getListingNameText(placeLink);
  return cleanBusinessName(raw);
}

/** Read a listing title without Google's sponsored "My Ad Centre" control. */
function getListingNameText(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('[aria-hidden="true"], [hidden], .offscreen')
    .forEach((node) => node.remove());
  stripGoogleAdUiNodes(clone);
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const SKIP_LINE_SELECTOR =
  '[role="heading"], .dbg0pd, .nwf-gmb-cat-wrap, .nwf-gbp-audit-wrap';

/**
 * Break a details container into its individual visual lines.
 *
 * Search stacks each line as a sibling `<div>` inside `.rllt__details`, and
 * `textContent` on the container would glue them into one string, producing
 * categories like "Plumber3+ years in business".
 */
function detailLineNodes(row: HTMLElement): HTMLElement[] {
  const blocks = Array.from(row.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      /^(?:DIV|P|LI)$/.test(child.tagName) &&
      !child.matches(SKIP_LINE_SELECTOR)
  );
  if (blocks.length === 0) return [row];
  return blocks.flatMap(detailLineNodes);
}

function getDetailLines(card: HTMLElement): string[] {
  const rows = Array.from(
    card.querySelectorAll('.W4Efsd, .rllt__details, .rllt__wrapped, .rllt__content')
  ) as HTMLElement[];
  const inner = rows.filter((row) => row.parentElement?.closest('.W4Efsd'));
  const source = inner.length > 0 ? inner : rows;

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const row of source.flatMap(detailLineNodes)) {
    const text = normalizeText(getText(row));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }

  if (lines.length === 0) {
    const fallback = normalizeText(getText(card));
    if (fallback) {
      for (const part of fallback.split(/[·•|]/).map((p) => p.trim()).filter(Boolean)) {
        if (!seen.has(part)) {
          seen.add(part);
          lines.push(part);
        }
      }
    }
  }

  return lines.filter(
    (line, index) =>
      !lines.some((other, otherIndex) => otherIndex !== index && other !== line && other.includes(line))
  );
}

function isBusinessAgeText(value: string): boolean {
  return /\d+\+?\s*years?\s+in\s+business/i.test(value);
}

function parseMetaSegment(part: string): { category: string; address: string; phone: string } {
  const result = { category: '', address: '', phone: '' };
  const foundPhone = extractPhone(part);
  if (foundPhone) {
    result.phone = foundPhone;
    const leftover = stripPhone(part);
    if (leftover && !isHoursText(leftover) && !isPriceText(leftover) && !isBusinessAgeText(leftover)) {
      result.address = leftover;
    }
    return result;
  }

  if (isHoursText(part) || isPriceText(part) || isBusinessAgeText(part)) return result;

  const unglued = unglueHours(part);
  const label = unglued.category || part;
  if (isHoursText(label) || isBusinessAgeText(label)) return result;

  if (!/\d/.test(label) && label.length >= 2 && label.length < 50) {
    result.category = label;
    return result;
  }

  if (/\d/.test(label) || /[A-Za-z]/.test(label)) {
    result.address = label;
  }

  return result;
}

function parseCardMeta(card: HTMLElement): { category: string; address: string; phone: string } {
  let category = '';
  let address = '';
  let phone = '';

  const telLink = card.querySelector('a[href^="tel:"]');
  if (telLink) {
    phone = normalizeText((telLink.getAttribute('href') ?? '').replace(/^tel:/i, ''));
  }

  const lines = getDetailLines(card);

  for (const line of lines) {
    if (/^\(\d/.test(line)) continue;

    const segments = line.split(/[·•|]/).map((part) => normalizeText(part)).filter(Boolean);
    const parts = segments.length > 1 ? segments : splitMetaParts(line);

    for (const part of parts) {
      if (/^\d\.\d/.test(part) || /\breviews?\b/i.test(part) || /^\(\d/.test(part)) continue;

      const parsed = parseMetaSegment(part);
      if (parsed.phone && !phone) phone = parsed.phone;
      if (parsed.category && !category) category = parsed.category;
      if (parsed.address && !address) address = parsed.address;
    }
  }

  if (!category) {
    const lineNodes = Array.from(
      card.querySelectorAll<HTMLElement>('.rllt__details, .W4Efsd')
    ).flatMap(detailLineNodes);
    for (const el of lineNodes) {
      const text = normalizeText(getText(el));
      for (const part of text.split(/[·•|]/).map((p) => p.trim()).filter(Boolean)) {
        if (/^\d\.\d/.test(part) || /\breviews?\b/i.test(part) || /^\(\d/.test(part)) continue;
        if (isHoursText(part) || isPriceText(part) || isBusinessAgeText(part)) continue;
        if (/^(sponsored|ad|ads|promoted)$/i.test(part)) continue;
        if (part.includes(',')) continue;
        if (part.length >= 2 && part.length < 50 && !/\d{3,}/.test(part)) {
          category = part;
          break;
        }
      }
      if (category) break;
    }
  }

  if (!phone) {
    phone = extractPhone(getText(card));
  }

  if (address) address = stripPhone(address);

  return { category, address, phone };
}

/** e.g. "10+ years in business" from Google Search / Maps listing cards. */
export function extractBusinessAge(card: HTMLElement): string {
  const matchAge = (text: string): string => {
    const match = normalizeText(text).match(/(\d+\+?\s*years?\s+in\s+business)/i);
    return match?.[1] ?? '';
  };

  for (const line of getDetailLines(card)) {
    const found = matchAge(line);
    if (found) return found;
  }

  return matchAge(card.textContent ?? '');
}

export function extractLeadFromCard(
  card: HTMLElement,
  businessId: string,
  mapsRank: number | null = null
): BusinessLead | null {
  const placeLink = getPlaceLink(card);
  const href = placeLink?.getAttribute('href') ?? '';
  const mapsUrl = getAbsoluteMapsUrl(href);
  const name = getListItemName(card);
  if (!name && !mapsUrl) return null;

  const scope = resolveListingScope(card);

  const ratingEl = scope.querySelector(
    'span[role="img"][aria-label*="stars" i], span[aria-label*="rated" i], ' +
      'span.ZkP5Je[aria-label], .MW4etd, .yi40Hd'
  );
  const rating =
    parseRatingFromAria(ratingEl?.getAttribute('aria-label') ?? '') ||
    normalizeText(getText(scope.querySelector('.MW4etd, .yi40Hd')));

  const reviewsEl = scope.querySelector('.UY7F9, .RDApEe');
  let reviews = parseReviewsCount(getText(reviewsEl));
  if (!reviews) {
    const reviewAria = Array.from(scope.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label') ?? '')
      .find((label) => /\breviews?\b/i.test(label));
    reviews = parseReviewsCount(reviewAria ?? '');
  }

  const { category, address, phone } = parseCardMeta(card);

  return {
    id: businessId || extractPlaceId(mapsUrl) || mapsUrl || name,
    name: name || 'Unknown Business',
    category,
    address,
    phone,
    rating,
    reviews,
    mapsUrl,
    mapsRank: typeof mapsRank === 'number' && mapsRank > 0 ? mapsRank : null,
    hasWebsite: false,
    ...emptyContactFields(),
  };
}

export function namesMatch(a: string, b: string): boolean {
  const left = cleanBusinessName(a).toLowerCase();
  const right = cleanBusinessName(b).toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function getPanelName(): string {
  const headings = document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge, [role="main"] h1');
  for (const heading of headings) {
    if (heading.closest('[role="feed"]')) continue;
    const name = cleanBusinessName(getVisibleText(heading));
    if (name) return name;
  }
  return '';
}

function getPanelRoot(): Element | null {
  const headings = document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge, [role="main"] h1');
  for (const heading of headings) {
    if (heading.closest('[role="feed"]')) continue;
    return (
      heading.closest('[role="main"]') ??
      heading.closest('div.m6QErb') ??
      heading.parentElement
    );
  }
  return null;
}

export function extractPanelAddress(): string {
  const root = getPanelRoot() ?? document;
  const selectors = [
    'a[data-item-id="address"]',
    'button[data-item-id="address"]',
    '[data-item-id="address"]',
    'button[aria-label^="Address"]',
    'button[aria-label*="Address:" i]',
    'a[aria-label*="Address:" i]',
    'button[data-tooltip="Copy address"]',
  ];

  let best = '';
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      const aria = (el.getAttribute('aria-label') ?? '').replace(/^Address:\s*/i, '').trim();
      const io = normalizeText(getVisibleText(el.querySelector('.Io6YTe') ?? el)).replace(/^Address:\s*/i, '').trim();
      const text = normalizeText(getVisibleText(el)).replace(/^Address:\s*/i, '').trim();
      const value = [aria, io, text].sort((a, b) => b.length - a.length)[0] ?? '';
      if (value.length > best.length) best = value;
    }
  }

  return best;
}

export function extractPanelPhone(): string {
  const root = getPanelRoot() ?? document;
  const selectors = [
    'button[data-item-id^="phone"]',
    'button[aria-label^="Phone"]',
    'a[href^="tel:"]',
  ];

  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (!el) continue;
    const href = (el.getAttribute('href') ?? '').replace(/^tel:/i, '');
    const aria = (el.getAttribute('aria-label') ?? '').replace(/^Phone:\s*/i, '');
    const text = getVisibleText(el);
    const value = extractPhone(href) || extractPhone(aria) || extractPhone(text);
    if (value) return value;
  }

  return '';
}

export async function waitForPanelName(expectedName: string, previousName: string, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = getPanelName();
    if (current && current !== previousName && namesMatch(current, expectedName)) return true;
    if (current && expectedName && namesMatch(current, expectedName)) return true;
    await sleep(200);
  }
  const current = getPanelName();
  return Boolean(current && namesMatch(current, expectedName));
}

/**
 * Wait for the detail panel to switch to the target listing.
 *
 * When `expectedName` is provided, waits until the panel title matches it.
 * Otherwise waits for any title different from `previousName`.
 *
 * Maps updates the URL before the panel h1 — never treat URL change alone as
 * success while the title still shows the previous listing (except same-name
 * chains where previous, expected, and current all match).
 *
 * Returns the new panel name on success, or whatever is showing on timeout.
 */
export async function waitForPanelSwitch(
  previousName: string,
  timeoutMs = 10000,
  expectedName = ''
): Promise<string> {
  const previousUrl = window.location.href;
  const started = Date.now();
  const target = expectedName.trim();

  const switchComplete = (current: string, urlChanged: boolean): boolean => {
    if (!current) return false;
    if (target && namesMatch(current, target)) return true;
    if (previousName && !namesMatch(current, previousName)) return true;
    if (!previousName) return true;
    // Same-name chain: URL moved but the title string is identical
    if (
      urlChanged &&
      target &&
      namesMatch(current, target) &&
      namesMatch(current, previousName)
    ) {
      return true;
    }
    return false;
  };

  while (Date.now() - started < timeoutMs) {
    const urlChanged = window.location.href !== previousUrl;
    const current = getPanelName();

    if (switchComplete(current, urlChanged)) return current;

    await sleep(150);
  }

  const final = getPanelName();
  const urlChanged = window.location.href !== previousUrl;
  if (switchComplete(final, urlChanged)) return final;
  return final;
}

/**
 * True if the open detail panel has loaded enough content to be scraped.
 * Uses both legacy data-item-id attributes and the current Maps DOM classes/
 * jsaction patterns visible in the user's panel HTML.
 */
export function panelHasDetailContent(): boolean {
  return Boolean(
    document.querySelector(
      // Legacy data-item-id selectors (still present on some elements)
      '[data-item-id="authority"], [data-item-id="address"], [data-item-id^="phone"], ' +
      '[data-item-id="oloc"], [data-item-id="oh"], a[aria-label^="Website:"], ' +
      // Current Maps DOM: hours section wrapper and toggle
      'div.OqCZI, [jsaction*="openhours"], ' +
      // Current Maps DOM: address/phone rows
      'button[data-item-id^="address"], [aria-label*="Address:" i], ' +
      '[aria-label*="Phone:" i], button[jsaction*="address"]'
    )
  );
}

/**
 * Check if the currently open detail panel has a website.
 * This checks the panel's website button/link using specific selectors.
 */
export function panelHasWebsiteLink(): boolean {
  // Specific selectors for the website element in Google Maps detail panel
  // data-item-id="authority" is the main website button
  const websiteSelectors = [
    'a[data-item-id="authority"]',
    'a[aria-label^="Website:"]',
    'a[data-tooltip="Open website"]',
    'a[data-value="Open website"]',
    'button[data-value="Website"]',
  ];
  
  for (const selector of websiteSelectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    
    // Skip if it's in the feed (search results)
    if (el.closest('[role="feed"]')) continue;
    
    // Skip "add website" suggestions
    const aria = el.getAttribute('aria-label') ?? '';
    const text = normalizeText(getText(el as HTMLElement));
    if (/add website|suggest.*website|claim this/i.test(`${aria} ${text}`)) continue;
    
    // Check if it has a valid external href
    const href = el.getAttribute('href') ?? '';
    if (href && isExternalWebsiteUrl(href)) return true;
  }

  return false;
}

export async function readFullAddressFromPanel(
  card: HTMLElement,
  expectedName: string
): Promise<{ address: string; phone: string; hasWebsite: boolean }> {
  const previousName = getPanelName();
  const clickTarget = getPlaceLink(card) ?? card;
  clickTarget.click();

  let ready = await waitForPanelName(expectedName, previousName, 8000);
  if (!ready) {
    card.click();
    ready = await waitForPanelName(expectedName, previousName, 5000);
  }

  await sleep(350);
  
  // Check for website in the detail panel
  const hasWebsite = panelHasWebsiteLink();
  
  return {
    address: extractPanelAddress(),
    phone: extractPanelPhone(),
    hasWebsite,
  };
}

export function pickFullerAddress(fromCard: string, fromPanel: string): string {
  if (!fromPanel) return fromCard;
  if (!fromCard) return fromPanel;
  return fromPanel.length >= fromCard.length ? fromPanel : fromCard;
}
