/** Detect the open Google Maps place detail pane (not the search results feed). */

export function isExtensionUiNode(el: Element): boolean {
  if (el.closest('.nwf-gmb-cat-wrap')) return true;
  if (el.closest('.nwf-gbp-audit-wrap')) return true;
  if (el.closest('[class*="gmb-everywhere"]')) return true;
  if (el.closest('[id^="popupButton"]')) return true;
  if (el.closest('[class*="l1zzyog7_gmb"]')) return true;
  return false;
}

export function getBusinessPanel(): HTMLElement | null {
  const infoRegions = document.querySelectorAll('[aria-label*="Information for"]');
  for (const info of infoRegions) {
    if (info.closest('[role="feed"]')) continue;

    let node: HTMLElement | null = info as HTMLElement;
    for (let depth = 0; depth < 18 && node; depth++) {
      if (node.querySelector('h1.DUwDvf, h1.fontHeadlineLarge') && node.querySelector('button[role="tab"]')) {
        return node;
      }
      node = node.parentElement;
    }
  }

  const headings = document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge');
  for (const heading of headings) {
    if (heading.closest('[role="feed"]')) continue;
    if (isExtensionUiNode(heading)) continue;

    let node: HTMLElement | null = heading as HTMLElement;
    for (let depth = 0; depth < 20 && node; depth++) {
      const hasInfo = node.querySelector('[aria-label*="Information for"]');
      const hasTabs = node.querySelector('button[role="tab"][aria-label*="Overview"]');
      if (hasInfo || hasTabs) return node;
      node = node.parentElement;
    }

    const fallback = heading.closest('div.m6QErb');
    if (fallback && !fallback.closest('[role="feed"]')) return fallback as HTMLElement;
  }

  return null;
}

/** Insert categories above Overview / Reviews / About tabs when possible. */
export function findDetailCategoryInsertPoint(panel: HTMLElement): {
  parent: HTMLElement;
  before: Element | null;
} {
  const overviewTab = panel.querySelector('button[role="tab"][aria-label*="Overview" i]');
  if (overviewTab) {
    const tabList = overviewTab.closest('[role="tablist"]');
    const tabRow = tabList?.parentElement;
    if (tabRow?.parentElement instanceof HTMLElement) {
      return { parent: tabRow.parentElement, before: tabRow };
    }
    if (tabRow instanceof HTMLElement && tabRow.parentElement) {
      return { parent: tabRow.parentElement, before: tabRow };
    }
  }

  const actionRow = panel.querySelector('.RcCsl, .RWPxGd, .MkV9');
  if (actionRow?.parentElement instanceof HTMLElement) {
    const parent = actionRow.parentElement;
    const next = actionRow.nextElementSibling;
    return { parent, before: next };
  }

  const header = panel.querySelector('h1.DUwDvf, h1.fontHeadlineLarge');
  const headerSection = header?.closest('.TIHn2')?.parentElement ?? header?.parentElement;
  if (headerSection instanceof HTMLElement) {
    return { parent: headerSection, before: headerSection.nextElementSibling };
  }

  return { parent: panel, before: panel.firstElementChild };
}
