/** Shared DOM helpers for Google Maps content script */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForElement(
  finder: () => Element | null,
  timeoutMs = 15000,
  intervalMs = 200
): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = finder();
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export function queryAll(selectors: string[]): Element[] {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

export function queryFirstIn(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function queryFirst(selectors: string[]): Element | null {
  return queryFirstIn(document, selectors);
}

export function getText(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

export function getVisibleText(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('[aria-hidden="true"], [hidden], .offscreen')
    .forEach((node) => node.remove());
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

import { normalizeMapsText, sanitizePlaceId } from './maps-id-utils';
import { cleanBusinessName } from '../utils/business-name';
import {
  collectSearchListingCards,
  findMapsPlaceLinks,
  getSearchLocalFeed,
  getSearchResultCard,
  isGoogleSearchPage,
  isMapsPlaceHref,
} from './search-dom-utils';

/** Extract a stable listing key from a Maps URL (ChIJ, hex fid, or cid — not the name slug). */
export function extractPlaceId(url: string): string | null {
  try {
    const href = normalizeMapsText(url);
    const parsed = new URL(href, 'https://www.google.com');

    const chijFrom19 = href.match(/!19s(ChIJ[a-zA-Z0-9_-]+)/i);
    if (chijFrom19) return sanitizePlaceId(chijFrom19[1]);

    const placeParam =
      href.match(/[?&]query_place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??
      href.match(/[?&]place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??
      href.match(/place_id:(ChIJ[a-zA-Z0-9_-]+)/i) ??
      href.match(/[?&]q=place_id:(ChIJ[a-zA-Z0-9_-]+)/i);
    if (placeParam) return sanitizePlaceId(placeParam[1]);

    const chijInline = href.match(/(ChIJ[a-zA-Z0-9_-]{10,})/);
    if (chijInline) return sanitizePlaceId(chijInline[1]);

    const fidMatch = href.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i);
    if (fidMatch) return fidMatch[1].toLowerCase();

    const cidMatch = href.match(/[?&](?:cid|ludocid)=(\d+)/i);
    if (cidMatch) return `cid:${cidMatch[1]}`;

    const slugMatch = parsed.pathname.match(/\/maps\/place\/([^/]+)/);
    if (slugMatch) {
      const slug = decodeURIComponent(slugMatch[1]);
      const fromSlug = sanitizePlaceId(slug);
      if (fromSlug) return fromSlug;
      return slug;
    }

    return null;
  } catch {
    return sanitizePlaceId(url);
  }
}

/** Hex feature id (0x…:0x…) from a Maps place URL. */
export function extractHexFidFromUrl(url: string): string | null {
  try {
    const href = normalizeMapsText(url);
    const fidMatch = href.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i) ?? href.match(/(0x[a-f0-9]+:0x[a-f0-9]+)/i);
    return fidMatch ? fidMatch[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Scan a card for a hex feature id. On Google Search the only Maps link is
 * often the Directions anchor (`/maps/dir/...!1s0x…:0x…`), which is not a
 * place href but still carries the listing's feature id.
 */
export function extractHexFidFromCard(card: Element): string | null {
  for (const el of card.querySelectorAll('a[href], [data-url], [data-ved]')) {
    for (const attr of ['href', 'data-url']) {
      const raw = el.getAttribute(attr);
      if (!raw) continue;
      const fid = extractHexFidFromUrl(raw);
      if (fid) return fid;
    }
  }
  return null;
}

/** Decimal CID encoded in the second half of a hex feature id. */
export function decimalCidFromHexFid(hexFid: string | null | undefined): string | null {
  const parts = hexFid?.split(':') ?? [];
  if (parts.length !== 2) return null;
  try {
    return BigInt(parts[1]).toString(10);
  } catch {
    return null;
  }
}

/** Canonical Maps URL for a listing that only exposes a CID. */
export function buildMapsUrlFromCid(decimalCid: string | null | undefined): string {
  return decimalCid ? `https://www.google.com/maps?cid=${decimalCid}` : '';
}

/** Decimal CID from card links, when present. */
export function extractDecimalCidFromUrl(url: string): string | null {
  try {
    const href = normalizeMapsText(url);
    const cidMatch = href.match(/[?&](?:cid|ludocid)=(\d+)/i);
    return cidMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

/** ChIJ place id from a Maps URL, when present. */
export function extractChijFromUrl(url: string): string | null {
  try {
    const href = normalizeMapsText(url);
    const chijFrom19 = href.match(/!19s(ChIJ[a-zA-Z0-9_-]+)/i);
    if (chijFrom19) return sanitizePlaceId(chijFrom19[1]);

    const placeParam =
      href.match(/[?&]query_place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??
      href.match(/[?&]place_id=(ChIJ[a-zA-Z0-9_-]+)/i) ??
      href.match(/place_id:(ChIJ[a-zA-Z0-9_-]+)/i);
    if (placeParam) return sanitizePlaceId(placeParam[1]);

    const chijInline = href.match(/(ChIJ[a-zA-Z0-9_-]{10,})/);
    return chijInline ? sanitizePlaceId(chijInline[1]) : null;
  } catch {
    return null;
  }
}

export function getResultFeed(): Element | null {
  if (isGoogleSearchPage()) {
    const searchFeed = getSearchLocalFeed();
    if (searchFeed) return searchFeed;
  }

  const roleFeed = document.querySelector('[role="feed"]');
  if (roleFeed) return roleFeed;

  const resultsLabel = document.querySelector('div[aria-label*="Results for"]');
  if (resultsLabel) return resultsLabel;

  // Avoid generic m6QErb — it often matches the place detail pane, not the results list.
  let best: Element | null = null;
  let bestCount = 0;
  for (const panel of document.querySelectorAll('div.m6QErb[aria-label*="Result"], div.m6QErb.DxyBCb, div[role="feed"]')) {
    const count = panel.querySelectorAll('a[href*="/maps/place/"]').length;
    if (count > bestCount) {
      bestCount = count;
      best = panel;
    }
  }

  if (best && bestCount >= 1) return best;

  return queryFirst(['div[aria-label*="Results for"]']);
}

export function getResultCard(node: Element): HTMLElement | null {
  if (isGoogleSearchPage()) {
    const searchCard = getSearchResultCard(node);
    if (searchCard) return searchCard;
  }

  const fromSelectors =
    (node.closest('div.Nv2PK') as HTMLElement | null) ??
    (node.closest('[role="article"]') as HTMLElement | null) ??
    (node.closest('div[jsaction*="mouseover"]') as HTMLElement | null) ??
    (node.closest('div[jsaction*="pane"]') as HTMLElement | null);

  if (fromSelectors && fromSelectors.tagName !== 'A') return fromSelectors;

  // Walk up from place link — never treat the <a> itself as the card root.
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  for (let depth = 0; depth < 10 && el; depth++) {
    if (el.tagName === 'A') {
      el = el.parentElement;
      continue;
    }
    const link = el.querySelector('a[href*="/maps/place/"]');
    const rect = el.getBoundingClientRect();
    if (link && rect.height >= 40 && rect.width >= 120) return el;
    el = el.parentElement;
  }

  return fromSelectors;
}

function readListingCid(card: Element): string | null {
  const raw =
    card.getAttribute('data-cid') ??
    card.getAttribute('data-rc_ludocids') ??
    card.querySelector('[data-cid]')?.getAttribute('data-cid') ??
    card.querySelector('[data-rc_ludocids]')?.getAttribute('data-rc_ludocids') ??
    card.closest('[data-cid]')?.getAttribute('data-cid') ??
    card.closest('[data-rc_ludocids]')?.getAttribute('data-rc_ludocids');
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
}

function unwrapGoogleRedirectHref(href: string): string {
  try {
    const url = new URL(href, 'https://www.google.com');
    if (url.hostname.includes('google.com') && url.pathname === '/url') {
      return url.searchParams.get('q') ?? url.searchParams.get('url') ?? href;
    }
  } catch {
    // keep raw href
  }
  return href;
}

/** Stable id for a listing card on Maps or Google Search local results. */
export function resolveListingPlaceId(card: Element): string {
  const link = getPlaceLink(card);
  const href = link?.getAttribute('href') ?? link?.getAttribute('data-url') ?? '';
  const fromHref = extractPlaceId(href);
  if (fromHref) return fromHref;

  if (href && isMapsPlaceHref(href)) {
    const unwrapped = unwrapGoogleRedirectHref(href);
    const fromUnwrapped = extractPlaceId(unwrapped);
    if (fromUnwrapped) return fromUnwrapped;
  }

  // Search listings often expose the feature id only via the Directions link.
  const hexFid = extractHexFidFromCard(card);
  if (hexFid) return hexFid;

  const cid = readListingCid(card);
  if (cid) return `cid:${cid}`;

  const name = cleanBusinessName(
    card.querySelector('[role="heading"], h3, .OSrXXb, .qBF1Pd')?.textContent?.trim() ?? ''
  );
  if (name.length >= 2) return `name:${name.slice(0, 80)}`;

  return '';
}

export function getPlaceLink(card: Element): HTMLAnchorElement | null {
  for (const link of card.querySelectorAll('a[href], a[data-url]')) {
    const href = link.getAttribute('href') ?? link.getAttribute('data-url') ?? '';
    if (isMapsPlaceHref(href) && link instanceof HTMLAnchorElement) {
      return link;
    }
  }

  for (const el of card.querySelectorAll('[data-url]')) {
    const href = el.getAttribute('data-url') ?? '';
    if (!isMapsPlaceHref(href)) continue;
    const anchor = el.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement) return anchor;
  }

  return null;
}

/** Result cards in the left-hand feed, not the place-title link alone */
export function getResultItems(feed: Element): HTMLElement[] {
  const seen = new Set<string>();
  const cards: HTMLElement[] = [];

  const addFromLink = (link: Element) => {
    const card = getResultCard(link) ?? (link instanceof HTMLElement ? link : null);
    if (!card || card.tagName === 'A') return;

    const href =
      link.getAttribute('href') ??
      link.getAttribute('data-url') ??
      (link instanceof HTMLAnchorElement ? link.href : '') ??
      '';
    const key = extractPlaceId(href) || resolveListingPlaceId(card);
    if (!key || seen.has(key)) return;

    seen.add(key);
    cards.push(card);
  };

  if (isGoogleSearchPage()) {
    for (const link of findMapsPlaceLinks(feed)) addFromLink(link);
    if (cards.length === 0) {
      for (const card of collectSearchListingCards()) {
        const key = resolveListingPlaceId(card);
        if (!key || seen.has(key)) continue;
        if (!feed.contains(card)) continue;
        seen.add(key);
        cards.push(card);
      }
    }
    if (cards.length > 0) return sortCardsByVisualOrder(cards);
  }

  feed.querySelectorAll('a[href*="/maps/place/"]').forEach(addFromLink);

  if (cards.length === 0) {
    for (const link of feed.querySelectorAll('a[href], [data-url]')) {
      const href = link.getAttribute('href') ?? link.getAttribute('data-url') ?? '';
      if (!isMapsPlaceHref(href)) continue;
      addFromLink(link);
    }
  }

  if (cards.length === 0) {
    feed.querySelectorAll('div.Nv2PK, [role="article"]').forEach((node) => {
      const key = resolveListingPlaceId(node);
      if (!key || seen.has(key)) return;
      seen.add(key);
      cards.push(node as HTMLElement);
    });
  }

  return sortCardsByVisualOrder(cards);
}

/** Keep feed cards in top-to-bottom order even if DOM query order differs. */
export function sortCardsByVisualOrder(cards: HTMLElement[]): HTMLElement[] {
  return [...cards].sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    const topDiff = rectA.top - rectB.top;
    if (Math.abs(topDiff) > 4) return topDiff;
    return rectA.left - rectB.left;
  });
}

export function scrollFeed(feed: Element): void {
  feed.scrollTop = feed.scrollHeight;
}

export function observeDomChanges(
  target: Node,
  callback: () => void,
  debounceMs = 300
): MutationObserver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  });
  observer.observe(target, { childList: true, subtree: true });
  return observer;
}
