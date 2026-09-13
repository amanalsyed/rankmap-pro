import {
  extractChijFromUrl,
  extractDecimalCidFromUrl,
  extractHexFidFromUrl,
  extractPlaceId,
  observeDomChanges,
} from './dom-utils';
import { fetchCategoriesForListing } from './maps-categories-bridge';
import {
  CATEGORY_ATTR,
  CATEGORY_PANEL_ATTR,
  CATEGORY_SIGNATURE_ATTR,
  mountCategoryRow,
} from './maps-gmb-categories-ui';
import { findDetailCategoryInsertPoint, getBusinessPanel } from './maps-detail-panel';
import {
  handleInvalidExtensionContext,
  isExtensionContextValid,
  isContextInvalidatedError,
} from './extension-context';

let bodyObserver: MutationObserver | null = null;
let injectIntervalId: number | null = null;
let observersStopped = false;
let lastPanelPlaceKey: string | null = null;
let pendingPlaceKey: string | null = null;

function currentPlaceKey(): string | null {
  const url = window.location.href;
  return (
    extractPlaceId(url) ??
    extractHexFidFromUrl(url) ??
    extractChijFromUrl(url) ??
    null
  );
}

function panelListingKeys(): {
  placeId: string;
  hexFid: string | null;
  chij: string | null;
  decimalCid: string | null;
} {
  const url = window.location.href;
  return {
    placeId: extractPlaceId(url) ?? url,
    hexFid: extractHexFidFromUrl(url),
    chij: extractChijFromUrl(url),
    decimalCid: extractDecimalCidFromUrl(url),
  };
}

function removeStaleDetailCategoryRows(activePlaceId: string | null): void {
  document.querySelectorAll(`[${CATEGORY_PANEL_ATTR}="1"]`).forEach((node) => {
    const rowPlaceId = node.getAttribute(CATEGORY_ATTR);
    if (!activePlaceId || rowPlaceId !== activePlaceId) {
      node.remove();
    }
  });
}

function injectDetailPanelCategories(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext();
    stopObservers();
    return;
  }

  try {
    const panel = getBusinessPanel();
    if (!panel) {
      if (lastPanelPlaceKey) {
        removeStaleDetailCategoryRows(null);
        lastPanelPlaceKey = null;
      }
      return;
    }

    const { placeId, hexFid, chij, decimalCid } = panelListingKeys();
    if (!placeId) return;

    const placeKey = chij ?? hexFid ?? placeId;
    if (lastPanelPlaceKey && lastPanelPlaceKey !== placeKey) {
      removeStaleDetailCategoryRows(placeId);
    }
    lastPanelPlaceKey = placeKey;

    const { parent } = findDetailCategoryInsertPoint(panel);
    const existing = parent.querySelector(`[${CATEGORY_ATTR}="${CSS.escape(placeId)}"][${CATEGORY_PANEL_ATTR}="1"]`);
    if (existing?.getAttribute(CATEGORY_SIGNATURE_ATTR)) return;

    if (pendingPlaceKey === placeKey) return;
    pendingPlaceKey = placeKey;

    void fetchCategoriesForListing(hexFid, chij ?? placeId, {
      decimalCid,
      timeoutMs: 7000,
    }).then((categories) => {
      pendingPlaceKey = null;
      if (!isExtensionContextValid() || !categories?.primary) return;

      const currentPanel = getBusinessPanel();
      if (!currentPanel) return;

      const currentKey = currentPlaceKey();
      if (currentKey !== placeKey) return;

      const insert = findDetailCategoryInsertPoint(currentPanel);
      mountCategoryRow({
        placeId,
        categories,
        parent: insert.parent,
        before: insert.before,
        labelText: 'GMB Categories:',
        isDetailPanel: true,
      });
    });
  } catch (error) {
    pendingPlaceKey = null;
    if (isContextInvalidatedError(error)) {
      handleInvalidExtensionContext();
      stopObservers();
    }
  }
}

function stopObservers(): void {
  if (observersStopped) return;
  observersStopped = true;
  bodyObserver?.disconnect();
  bodyObserver = null;
  if (injectIntervalId !== null) {
    window.clearInterval(injectIntervalId);
    injectIntervalId = null;
  }
}

function startObservers(): void {
  injectDetailPanelCategories();
  bodyObserver = observeDomChanges(document.body, injectDetailPanelCategories, 300);
  injectIntervalId = window.setInterval(injectDetailPanelCategories, 2500);

  window.addEventListener('popstate', injectDetailPanelCategories);
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  history.pushState = (...args) => {
    const result = pushState(...args);
    injectDetailPanelCategories();
    return result;
  };
  history.replaceState = (...args) => {
    const result = replaceState(...args);
    injectDetailPanelCategories();
    return result;
  };
}

function bootstrap(): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext();
    return;
  }

  startObservers();
  window.setTimeout(injectDetailPanelCategories, 600);
  window.setTimeout(injectDetailPanelCategories, 1500);
  window.setTimeout(injectDetailPanelCategories, 3500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

export {};
