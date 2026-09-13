/** Helpers for Google Search local pack / "More places" listings (not Maps). */

const GOOGLE_HOST_RE = /(^|\.)google\.(com|[a-z]{2,3})(\.\w{2})?$/i;

export function isGoogleHost(): boolean {
  try {
    return GOOGLE_HOST_RE.test(new URL(window.location.href).hostname);
  } catch {
    return false;
  }
}

export function isGoogleSearchPage(): boolean {
  try {
    const url = new URL(window.location.href);
    if (!GOOGLE_HOST_RE.test(url.hostname)) return false;
    return url.pathname === '/search' || url.pathname.startsWith('/search/');
  } catch {
    return false;
  }
}

export function isGoogleMapsPage(): boolean {
  try {
    const url = new URL(window.location.href);
    return GOOGLE_HOST_RE.test(url.hostname) && url.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}

/** True when the page shows local business listings (3-pack or expanded local results). */
export function pageHasLocalResults(): boolean {
  if (!isGoogleSearchPage()) return false;

  // Local pack / local finder containers (even before place links render)
  if (
    document.querySelector(
      '[data-local-attribute], .VkpGBb, .rllt__details, .rllt__link, ' +
        'div[jsname="MZArnb"], div[jsname="Cpkphb"], div[data-cid], .uMdPh, ' +
        'div.Nv2PK, div.bfdHYe, div[role="feed"], [data-rc_ludocids], ' +
        '[data-attrid*="local"], [aria-label*="Places"], [aria-label*="place"]'
    )
  ) {
    return true;
  }

  // Maps place links (many href shapes on Search)
  if (
    document.querySelector(
      'a[href*="/maps/place"], a[href*="maps.google.com"], a[href*="maps?cid"], ' +
        'a[href*="ludocid"], [data-url*="/maps/place"], [data-url*="maps?cid"]'
    )
  ) {
    return true;
  }

  return findMapsPlaceLinks().length > 0;
}

export function shouldActivateListingTools(): boolean {
  if (isGoogleMapsPage()) return true;
  // Always watch Search SERPs — local pack loads async after first paint.
  return isGoogleSearchPage();
}

const SEARCH_LOCAL_ROOT_SELECTORS = [
  'div[role="feed"]',
  '#center_col',
  '#search',
  '#rso',
  '[data-async-context*="local"]',
  'div[aria-label*="Places"]',
  'div[aria-label*="Results for"]',
  'div[aria-label*="place"]',
];

const SEARCH_CARD_SELECTOR_LIST = [
  'div.Nv2PK',
  'div.bfdHYe',
  '.VkpGBb',
  '.rllt__details',
  '.rllt__link',
  '[data-local-attribute]',
  'div[jsname="MZArnb"]',
  'div[jsname="Cpkphb"]',
  '.uMdPh',
  'div[data-cid]',
  '[data-rc_ludocids]',
];

const SEARCH_CARD_SELECTORS = SEARCH_CARD_SELECTOR_LIST.join(', ');

export function findMapsPlaceLinks(root: ParentNode = document): HTMLAnchorElement[] {
  const links: HTMLAnchorElement[] = [];
  const seen = new Set<string>();

  for (const el of root.querySelectorAll('a[href], [data-url]')) {
    const href =
      el.getAttribute('href') ??
      el.getAttribute('data-url') ??
      '';
    if (!isMapsPlaceHref(href)) continue;
    const key = href.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    if (el instanceof HTMLAnchorElement) {
      links.push(el);
    } else {
      // Wrap data-url elements as synthetic lookup via closest anchor
      const anchor = el.closest('a[href]');
      if (anchor instanceof HTMLAnchorElement && isMapsPlaceHref(anchor.getAttribute('href') ?? '')) {
        if (!seen.has(anchor.href)) {
          seen.add(anchor.href);
          links.push(anchor);
        }
      }
    }
  }

  return links;
}

/** Find the container holding local business listing cards on Google Search. */
export function getSearchLocalFeed(): Element | null {
  let best: Element | null = null;
  let bestCount = 0;

  for (const selector of SEARCH_LOCAL_ROOT_SELECTORS) {
    for (const root of document.querySelectorAll(selector)) {
      const count = countPlaceLinks(root);
      if (count > bestCount) {
        bestCount = count;
        best = root;
      }
    }
  }

  if (best && bestCount >= 1) return best;

  const roleFeed = document.querySelector('div[role="feed"]');
  if (roleFeed && roleFeed.querySelector(SEARCH_CARD_SELECTORS)) return roleFeed;

  const firstLink = findMapsPlaceLinks()[0];
  const block = firstLink?.closest(SEARCH_CARD_SELECTORS);
  if (block?.parentElement) return block.parentElement;

  return document.querySelector('#center_col') ?? document.querySelector('#search');
}

function countPlaceLinks(root: Element): number {
  const seen = new Set<string>();
  for (const link of root.querySelectorAll('a[href], [data-url]')) {
    const href = link.getAttribute('href') ?? link.getAttribute('data-url') ?? '';
    if (!isMapsPlaceHref(href)) continue;
    seen.add(href.split('?')[0]);
  }
  return seen.size;
}

export function isMapsPlaceHref(href: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  if (lower.includes('/maps/place/')) return true;
  if (lower.includes('maps.google.com') && (lower.includes('/place') || lower.includes('cid='))) return true;
  if (lower.includes('/maps?') && (lower.includes('cid=') || lower.includes('ludocid='))) return true;
  if (lower.includes('ludocid=')) return true;
  if (lower.includes('/url?')) {
    try {
      const url = new URL(href, window.location.origin);
      const target = url.searchParams.get('q') ?? url.searchParams.get('url') ?? '';
      return isMapsPlaceHref(target);
    } catch {
      return false;
    }
  }
  return false;
}

/** Resolve listing card root from a place link on Google Search. */
export function getSearchResultCard(link: Element): HTMLElement | null {
  const fromSelectors = link.closest(SEARCH_CARD_SELECTORS);
  if (fromSelectors instanceof HTMLElement && fromSelectors.tagName !== 'A') {
    return fromSelectors;
  }

  let el: HTMLElement | null = link instanceof HTMLElement ? link : link.parentElement;
  for (let depth = 0; depth < 12 && el; depth++) {
    if (el.tagName === 'A') {
      el = el.parentElement;
      continue;
    }
    const placeLink = el.querySelector('a[href*="/maps"], a[href*="maps?cid"], [data-url*="/maps"]');
    const rect = el.getBoundingClientRect();
    if (placeLink && rect.height >= 24 && rect.width >= 60) return el;
    el = el.parentElement;
  }

  return fromSelectors instanceof HTMLElement ? fromSelectors : null;
}

/** Collect listing cards on Google Search local pack / more places views. */
export function collectSearchListingCards(): HTMLElement[] {
  const cards: HTMLElement[] = [];
  const seen = new Set<string>();

  const addCard = (card: HTMLElement, key: string) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    cards.push(card);
  };

  for (const link of findMapsPlaceLinks()) {
    const card = getSearchResultCard(link);
    if (!card) continue;
    const href = link.getAttribute('href') ?? link.getAttribute('data-url') ?? link.href ?? '';
    addCard(card, href.split('?')[0] || card.textContent?.slice(0, 48) || '');
  }

  // Cards located by data-cid / ludocid when href is missing
  for (const el of document.querySelectorAll('div[data-cid], [data-local-attribute], [data-rc_ludocids]')) {
    const cid = el.getAttribute('data-cid') ?? el.getAttribute('data-rc_ludocids');
    if (!cid) continue;
    const card =
      (el instanceof HTMLElement ? getSearchResultCard(el) : null) ??
      el.closest(SEARCH_CARD_SELECTORS);
    if (card instanceof HTMLElement) addCard(card, `cid:${cid}`);
  }

  // Known card shells (local pack + expanded "More places" list)
  for (const selector of SEARCH_CARD_SELECTOR_LIST) {
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement) || el.tagName === 'A') continue;
      const key =
        el.getAttribute('data-cid') ??
        el.getAttribute('data-rc_ludocids') ??
        getPlaceLinkFromCard(el)?.getAttribute('href')?.split('?')[0] ??
        el.textContent?.trim().slice(0, 64) ??
        '';
      if (!key) continue;
      addCard(el, key);
    }
  }

  return cards;
}

function getPlaceLinkFromCard(card: Element): HTMLAnchorElement | null {
  for (const link of card.querySelectorAll('a[href], a[data-url]')) {
    const href = link.getAttribute('href') ?? link.getAttribute('data-url') ?? '';
    if (isMapsPlaceHref(href) && link instanceof HTMLAnchorElement) return link;
  }
  return null;
}

const EXTENSION_NODE_SELECTOR =
  '.nwf-gmb-cat-wrap, .nwf-gbp-audit-wrap, #nwf-local-scan-bar, [data-nwf-local-scan-mounted]';

const BLOCK_SELECTOR = 'div, p, li, br, tr, section, h1, h2, h3, h4, h5, h6';

/**
 * Text of an element with our own injected nodes stripped out.
 *
 * Listing details are stacked sibling `<div>`s, so raw `textContent` glues
 * separate lines together ("Dental clinicSydney NSW, AustraliaClosed"). Emit an
 * explicit separator at every block boundary so callers can tell lines apart.
 */
function cleanElementText(el: Element): string {
  const hasBlocks = el.querySelector(BLOCK_SELECTOR) !== null;
  const hasInjected = el.querySelector(EXTENSION_NODE_SELECTOR) !== null;

  if (!hasBlocks && !hasInjected) {
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(EXTENSION_NODE_SELECTOR).forEach((node) => node.remove());
  clone.querySelectorAll(BLOCK_SELECTOR).forEach((node) => {
    node.insertAdjacentText('beforebegin', ' · ');
    node.insertAdjacentText('afterend', ' · ');
  });

  return (clone.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*·\s*)+/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim();
}

const HOURS_TEXT_RE =
  /\b(open|closed|closes|opens|24 hours|24 hrs|permanently|temporarily)\b/i;
const NOT_A_CATEGORY_RE =
  /^(sponsored|ad|ads|website|directions|call|save|share|reviews?|more places|places)$/i;

function looksLikeCategory(value: string): boolean {
  const text = value.trim();
  if (text.length < 3 || text.length > 60) return false;
  if (NOT_A_CATEGORY_RE.test(text)) return false;
  // GMB categories never contain commas; addresses always do.
  if (text.includes(',')) return false;
  // Two lines glued together lose the word boundary ("AustraliaClosed"), so
  // split camel humps before testing for hours text.
  if (HOURS_TEXT_RE.test(text.replace(/([a-z])([A-Z])/g, '$1 $2'))) return false;
  if (HOURS_TEXT_RE.test(text)) return false;
  if (/["“”]/.test(text)) return false;
  if (/^\$/.test(text)) return false;
  if (/\d/.test(text)) return false;
  if (/[.]{2,}|…/.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

/**
 * Google Search local listings render the category directly after the review
 * count, e.g. "4.9 ★★★★★ (369) · Dentist". Read it from that line rather than
 * from class names, which Google rotates frequently.
 */
const REVIEW_COUNT_CATEGORY_RE = /\(\s*[\d.,]+\s*[KkMm]?\s*\)\s*[·•\u00b7]\s*([^·•\u00b7]{3,60})/;
const RATING_CATEGORY_RE = /\b\d[.,]\d\b[^·•\u00b7]{0,40}[·•\u00b7]\s*([^·•\u00b7]{3,60})/;

/**
 * Local pack cards carry the business' knowledge-graph id as `id="pv-/g/…"` — the same
 * id Google puts in the place viewer's `#sv=` payload, so it identifies which listing a
 * viewer belongs to.
 */
export function readCardKgMid(card: Element): string | null {
  const holder =
    card.querySelector('[id^="pv-/g/"]') ?? (card.id.startsWith('pv-/g/') ? card : null);
  const id = holder?.getAttribute('id') ?? '';
  return id.startsWith('pv-') ? id.slice(3) : null;
}

export function readSearchCardCategory(card: HTMLElement): string {
  const scoped = [...card.querySelectorAll('div, span')].filter(
    (el) => !el.closest(EXTENSION_NODE_SELECTOR)
  );

  for (const el of [...scoped, card]) {
    const text = cleanElementText(el);
    if (!text || text.length > 240) continue;

    const match = text.match(REVIEW_COUNT_CATEGORY_RE) ?? text.match(RATING_CATEGORY_RE);
    const candidate = match?.[1]?.trim();
    if (candidate && looksLikeCategory(candidate)) return candidate;
  }

  return '';
}

/**
 * Mount pills on the listing shell (`.VkpGBb`), not the inner text column.
 * Google puts an inline fixed `height` on `.rllt__details`, so anything added
 * inside it is clipped; the shell is also where the audit button already sits.
 */
export function findSearchCategoryMount(
  card: HTMLElement
): { parent: HTMLElement; before: Element | null } {
  const block =
    card.closest<HTMLElement>('.VkpGBb') ??
    card.querySelector<HTMLElement>('.VkpGBb') ??
    (card.matches(SEARCH_CARD_SELECTORS) ? card : null) ??
    card;

  const auditWrap = block.querySelector(':scope > .nwf-gbp-audit-wrap');
  return { parent: block, before: auditWrap };
}

export function getSearchResultsLabel(): string | null {
  const labeled = document.querySelector('[aria-label*="Results for"], [aria-label*="Places"]');
  const aria = labeled?.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  try {
    const q = new URLSearchParams(window.location.search).get('q')?.trim();
    if (q) return `Results for ${q}`;
  } catch {
    // ignore
  }

  return null;
}

function findLocalPackMount(firstCard: HTMLElement): { parent: HTMLElement; before: Element | null } | null {
  let node: HTMLElement | null = firstCard;

  for (let depth = 0; depth < 8 && node; depth++) {
    const container: HTMLElement | null = node.parentElement;
    if (!container) break;

    const listingNodes = [...container.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        (child.matches(SEARCH_CARD_SELECTORS) || Boolean(child.querySelector(SEARCH_CARD_SELECTORS)))
    );

    if (listingNodes.length >= 2) {
      const firstListing =
        listingNodes.find((child) => child.matches(SEARCH_CARD_SELECTORS)) ??
        listingNodes[0].querySelector<HTMLElement>(SEARCH_CARD_SELECTORS) ??
        listingNodes[0];
      return { parent: container, before: firstListing };
    }

    const rect = container.getBoundingClientRect();
    if (rect.width >= 300 && container.contains(firstCard)) {
      return { parent: container, before: firstCard };
    }

    if (container.matches('[data-local-attribute], div[jsname="Cpkphb"], div[jsname="MZArnb"]')) {
      return { parent: container, before: firstCard };
    }

    node = container;
  }

  if (firstCard.parentElement instanceof HTMLElement) {
    return { parent: firstCard.parentElement, before: firstCard };
  }

  return null;
}

const PLACES_HEADING_RE = /^(places|more places|local results|businesses)$/i;

/**
 * The "Places" heading above the local pack. Mount the scan bar inside it so it
 * sits inline beside the text instead of dropping onto its own row.
 */
export function findSearchPlacesHeaderMount(): { parent: HTMLElement; before: Element | null } | null {
  const root = document.querySelector('#center_col') ?? document.body;
  if (!root) return null;

  const headings = [
    ...root.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], div, span'),
  ];

  for (const el of headings) {
    if (el.closest(EXTENSION_NODE_SELECTOR)) continue;
    if (!PLACES_HEADING_RE.test(cleanElementText(el))) continue;
    // Only the heading itself, not a wrapper that also contains the listings.
    if (el.querySelector(SEARCH_CARD_SELECTORS)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0 || rect.height > 80) continue;
    return { parent: el, before: null };
  }

  return null;
}

export function findSearchBarMount(firstCard?: HTMLElement | null): { parent: HTMLElement; before: Element | null } | null {
  const placesHeader = findSearchPlacesHeaderMount();
  if (placesHeader) return placesHeader;

  const card = firstCard ?? collectSearchListingCards()[0] ?? null;
  if (card) {
    const packMount = findLocalPackMount(card);
    if (packMount) return packMount;
  }

  const feed = getSearchLocalFeed();
  if (feed instanceof HTMLElement) {
    const firstListing = feed.querySelector<HTMLElement>(SEARCH_CARD_SELECTORS);
    if (firstListing?.parentElement instanceof HTMLElement) {
      return { parent: firstListing.parentElement, before: firstListing };
    }
  }

  const center = document.querySelector('#center_col, #search');
  if (center?.parentElement instanceof HTMLElement) {
    return { parent: center.parentElement, before: center };
  }

  return null;
}

const activationCallbacks = new Set<() => void>();
let activationWatcherInstalled = false;

/**
 * Watch for SPA navigations (homepage → search) and late-loading local packs.
 * Google Search often never reloads the page, so content scripts must react to URL/DOM changes.
 */
export function onListingToolsActivation(callback: () => void): void {
  activationCallbacks.add(callback);
  if (shouldActivateListingTools()) {
    callback();
  }
  ensureActivationWatcher();
}

function ensureActivationWatcher(): void {
  if (activationWatcherInstalled) return;
  activationWatcherInstalled = true;

  let lastHref = location.href;
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = (): void => {
    if (!shouldActivateListingTools()) return;
    for (const cb of activationCallbacks) cb();
  };

  const scheduleNotify = (): void => {
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(notify, 120);
  };

  const checkNavigation = (): void => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    scheduleNotify();
  };

  window.addEventListener('popstate', checkNavigation);
  window.addEventListener('hashchange', checkNavigation);
  setInterval(checkNavigation, 700);

  // Google Search uses pushState/replaceState for in-page navigations (homepage → results).
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      checkNavigation();
      scheduleNotify();
    };
  }

  new MutationObserver(scheduleNotify).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
