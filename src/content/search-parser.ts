import { isUsefulEmail } from '../enrichment/search-utils';
import type { SearchParseResult, SearchResultItem } from '../enrichment/search-utils';
import { cleanBusinessName } from '../utils/business-name';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function unwrapGoogleUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.hostname.includes('google.com') && url.pathname === '/url') {
      return url.searchParams.get('q') ?? url.searchParams.get('url') ?? href;
    }
  } catch {
    // keep original
  }
  return href;
}

function collectLinks(): string[] {
  const nodes = document.querySelectorAll<HTMLAnchorElement>('a[href]');
  const links: string[] = [];
  const seen = new Set<string>();

  nodes.forEach((anchor) => {
    const href = unwrapGoogleUrl(anchor.href);
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push(href);
  });

  return links;
}

function collectSearchResults(): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const blocks = document.querySelectorAll('#search .g, #rso .g, div[data-hveid]');

  blocks.forEach((block) => {
    const anchor = block.querySelector<HTMLAnchorElement>('a[href^="http"]');
    if (!anchor) return;
    const url = unwrapGoogleUrl(anchor.href);
    const title = anchor.textContent?.trim() ?? block.querySelector('h3')?.textContent?.trim() ?? '';
    const snippet =
      block.querySelector('.VwiC3b, .IsZvec, .st, span[data-ved]')?.textContent?.trim() ??
      block.textContent?.trim().slice(0, 300) ??
      '';
    if (!title && !snippet) return;
    items.push({ title, snippet, url });
  });

  if (items.length === 0) {
    document.querySelectorAll('#search a[href^="http"], #rso a[href^="http"]').forEach((node) => {
      const anchor = node as HTMLAnchorElement;
      const url = unwrapGoogleUrl(anchor.href);
      if (!url.includes('google.com/search')) {
        items.push({
          title: anchor.textContent?.trim() ?? '',
          snippet: '',
          url,
        });
      }
    });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function collectEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    const email = match.toLowerCase();
    if (isUsefulEmail(email)) unique.add(email);
  }
  return [...unique];
}

function parseSearchPage(): SearchParseResult {
  const results = collectSearchResults();
  const text = document.body?.innerText ?? '';
  const combinedText = results.map((r) => `${r.title} ${r.snippet}`).join('\n') + '\n' + text;
  return {
    links: collectLinks(),
    emails: collectEmails(combinedText),
    text: combinedText,
    results,
  };
}

function waitForResults(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('#search, #rso, #center_col')) {
      resolve();
      return;
    }
    const start = Date.now();
    const observer = new MutationObserver(() => {
      if (document.querySelector('#search, #rso, #center_col') || Date.now() - start > timeoutMs) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
  });
}

import type { Search3PackEntry } from '../local-scan/types';

function parseRating(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:stars?|★)?/i) ?? text.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : null;
}

function parseReviewCount(text: string): number | null {
  const match = text.match(/([\d,]+)\s*reviews?/i);
  if (!match) return null;
  const n = parseInt(match[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseLocal3Pack(): Search3PackEntry[] {
  const results: Search3PackEntry[] = [];
  const seen = new Set<string>();

  const localRoots = [
    ...document.querySelectorAll('[data-local-attribute], .VkpGBb, div[jsname="Cpkphb"], div[jsname="MZArnb"]'),
  ];

  const anchors = localRoots.length
    ? localRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place"]')))
    : Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place"]'));

  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href || seen.has(href)) continue;

    const block =
      anchor.closest('.VkpGBb, .rllt__details, [data-local-attribute], div[jsname="MZArnb"], div[jsname="Cpkphb"]') ??
      anchor.closest('div[data-hveid]');
    if (!block && results.length >= 3) continue;

    const name = cleanBusinessName(
      anchor.getAttribute('aria-label')?.replace(/^Map of\s+/i, '') ??
        anchor.querySelector('span, div')?.textContent?.trim() ??
        anchor.textContent?.trim() ??
        ''
    );
    if (!name || name.length < 2) continue;

    seen.add(href);
    const text = block?.textContent ?? '';
    const categoryMatch = text.match(
      new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,120}?([A-Za-z][A-Za-z &]+)`)
    );

    results.push({
      rank: results.length + 1,
      name,
      category: categoryMatch?.[1]?.trim() ?? '',
      rating: parseRating(text),
      reviewCount: parseReviewCount(text),
      address: '',
      mapsUrl: href,
    });

    if (results.length >= 3) break;
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING_SEARCH') {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PARSE_LOCAL_3PACK') {
    void waitForResults().then(() => {
      sendResponse({ entries: parseLocal3Pack() });
    });
    return true;
  }

  if (message.type === 'PARSE_SEARCH') {
    void waitForResults().then(() => {
      sendResponse(parseSearchPage());
    });
    return true;
  }

  return false;
});

export {};
