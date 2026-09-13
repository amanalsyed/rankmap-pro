import type { BusinessLead, ScanParams } from '../types';
import { emptyContactFields } from '../types';
import {
  extractPlaceId,
  getPlaceLink,
  getResultFeed,
  getResultItems,
  observeDomChanges,
  scrollFeed,
  sleep,
  waitForElement,
} from './dom-utils';
import { cardHasWebsite, extractLeadFromCard, pickFullerAddress, readFullAddressFromPanel } from './website-detector';

let scanning = false;
let stopRequested = false;
let pauseRequested = false;

function sendMessage(payload: Record<string, unknown>): Promise<void> {
  return chrome.runtime.sendMessage(payload).then(
    () => undefined,
    () => undefined
  );
}

const HIGHLIGHT_STYLE_ID = 'nwf-current-card-style';
const HIGHLIGHT_CLASS = 'nwf-current-card';

function ensureHighlightStyles(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #4f46e5 !important;
      outline-offset: 3px !important;
      border-radius: 16px !important;
      box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.22), 0 10px 28px rgba(79, 70, 229, 0.28) !important;
      background: rgba(79, 70, 229, 0.06) !important;
      position: relative !important;
      z-index: 5 !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function highlightCard(card: HTMLElement): void {
  ensureHighlightStyles();
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
  card.classList.add(HIGHLIGHT_CLASS);
  card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function clearHighlight(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
}

async function waitWhilePaused(): Promise<boolean> {
  while (pauseRequested && !stopRequested) {
    await sleep(300);
  }
  return !stopRequested;
}

function reportProgress(
  checked: number,
  withoutWebsite: number,
  target: number,
  status: 'scanning' | 'paused' = 'scanning'
): Promise<void> {
  return sendMessage({
    type: 'SCAN_PROGRESS',
    progress: {
      status,
      checked,
      withoutWebsite,
      target,
    },
  });
}

function reportComplete(
  checked: number,
  withoutWebsite: number,
  target: number,
  results: BusinessLead[]
): Promise<void> {
  return sendMessage({
    type: 'SCAN_COMPLETE',
    progress: {
      status: 'complete',
      checked,
      withoutWebsite,
      target,
    },
    results,
  });
}

function reportError(message: string): void {
  sendMessage({ type: 'SCAN_ERROR', message });
}

async function waitForResultsFeed(): Promise<Element | null> {
  return waitForElement(() => getResultFeed(), 20000, 300);
}

function cardId(card: HTMLElement): string {
  const href = getPlaceLink(card)?.getAttribute('href') ?? '';
  return extractPlaceId(href) ?? href;
}

async function loadMoreResults(
  feed: Element,
  needed: number,
  processedIds: Set<string>
): Promise<HTMLElement[]> {
  let attempts = 0;
  const maxAttempts = 40;
  let lastCount = 0;
  let stalled = 0;

  while (attempts < maxAttempts && !stopRequested) {
    if (!(await waitWhilePaused())) break;

    const items = getResultItems(feed);
    const unchecked = items.filter((card) => {
      const id = cardId(card);
      return id && !processedIds.has(id);
    });

    if (items.length >= needed && unchecked.length === 0) break;
    if (items.length >= needed) break;

    if (items.length === lastCount) {
      stalled++;
      if (stalled >= 6) break;
    } else {
      stalled = 0;
      lastCount = items.length;
    }

    scrollFeed(feed);
    await sleep(900);
    attempts++;
  }

  return getResultItems(feed);
}

async function runScan(params: ScanParams): Promise<void> {
  if (scanning) return;
  scanning = true;
  stopRequested = false;
  pauseRequested = false;

  const { count: target } = params;
  let checked = 0;
  let withoutWebsite = 0;
  const processedIds = new Set<string>();
  const found: BusinessLead[] = [];

  /** Assign rank only when card order in the feed can be verified. */
  function resolveMapsRank(card: HTMLElement, feed: Element, sequentialRank: number): number | null {
    if (sequentialRank <= 0) return null;
    const items = getResultItems(feed);
    const index = items.findIndex((item) => item === card);
    if (index === -1) return sequentialRank;
    const domRank = index + 1;
    if (domRank === sequentialRank) return sequentialRank;
    // Prefer sequential rank when scrolling loads more — DOM may include already-processed cards above.
    if (domRank >= sequentialRank) return sequentialRank;
    return domRank > 0 ? domRank : null;
  }

  try {
    const feed = await waitForResultsFeed();
    if (!feed) {
      reportError('Could not find local business listings. Make sure results are visible on the page.');
      return;
    }

    reportProgress(checked, withoutWebsite, target);

    while (checked < target && !stopRequested) {
      if (!(await waitWhilePaused())) break;

      const items = await loadMoreResults(feed, target, processedIds);
      if (items.length === 0) {
        reportError('No businesses found for this search.');
        break;
      }

      let progressed = false;

      for (const card of items) {
        if (checked >= target || stopRequested) break;
        if (!(await waitWhilePaused())) break;

        const businessId = cardId(card);
        if (!businessId || processedIds.has(businessId)) continue;

        processedIds.add(businessId);
        progressed = true;
        checked++;
        const mapsRank = resolveMapsRank(card, feed, checked);
        highlightCard(card);
        await sleep(80);
        void reportProgress(checked, withoutWebsite, target);

        // First check: listing card has visible website link
        if (cardHasWebsite(card)) {
          continue;
        }

        const lead =
          extractLeadFromCard(card, businessId, mapsRank) ??
          ({
            id: businessId,
            name: 'Unknown Business',
            category: '',
            address: '',
            phone: '',
            rating: '',
            reviews: '',
            mapsUrl: getPlaceLink(card)?.getAttribute('href') ?? '',
            mapsRank,
            hasWebsite: false,
            ...emptyContactFields(),
          } satisfies BusinessLead);

        // Second check: open the detail panel and check for website there
        const panelInfo = await readFullAddressFromPanel(card, lead.name);
        
        // Skip if website found in detail panel (not visible on card)
        if (panelInfo.hasWebsite) {
          continue;
        }
        
        lead.address = pickFullerAddress(lead.address, panelInfo.address);
        if (panelInfo.phone) lead.phone = panelInfo.phone;

        withoutWebsite++;
        found.push(lead);
        await sendMessage({ type: 'SCAN_RESULT', business: lead });
        void reportProgress(checked, withoutWebsite, target);
      }

      if (!progressed) {
        scrollFeed(feed);
        await sleep(1200);
        const moreItems = getResultItems(feed);
        const hasNew = moreItems.some((card) => {
          const id = cardId(card);
          return id && !processedIds.has(id);
        });
        if (!hasNew) break;
      }
    }

    await reportComplete(checked, withoutWebsite, target, found);
  } catch (err) {
    reportError(err instanceof Error ? err.message : 'Scan failed unexpectedly.');
  } finally {
    clearHighlight();
    scanning = false;
    stopRequested = false;
    pauseRequested = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_SCAN') {
    runScan(message.params as ScanParams);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'STOP_SCAN') {
    stopRequested = true;
    pauseRequested = false;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PAUSE_SCAN') {
    pauseRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESUME_SCAN') {
    pauseRequested = false;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ ok: true, scanning, paused: pauseRequested });
    return true;
  }

  if (message.type === 'RUN_GBP_AUDIT') {
    void (async () => {
      try {
        const { runGbpAudit } = await import('./gbp-auditor');
        const lead = message.lead as BusinessLead;
        const snapshot = await runGbpAudit(lead);
        sendResponse({ ok: true, snapshot });
      } catch (err) {
        sendResponse({
          ok: false,
          message: err instanceof Error ? err.message : 'GBP audit scrape failed.',
        });
      }
    })();
    return true;
  }

  if (message.type === 'GBP_AUDIT_PANEL_READY') {
    void (async () => {
      try {
        const { checkGbpPanelReady } = await import('./gbp-auditor');
        const lead = message.lead as BusinessLead;
        sendResponse({ ready: checkGbpPanelReady(lead.name) });
      } catch {
        sendResponse({ ready: false });
      }
    })();
    return true;
  }

  return false;
});

const bootstrapObserver = () => {
  const feed = getResultFeed();
  if (feed) {
    observeDomChanges(feed, () => {
      // DOM updates handled during active scan loop
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapObserver);
} else {
  bootstrapObserver();
}

export {};
