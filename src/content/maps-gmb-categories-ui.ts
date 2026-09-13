import type { BusinessCategories } from './maps-categories-bridge';

export const GMB_CATEGORY_STYLE_ID = 'nwf-gmb-category-style';
export const CATEGORY_ATTR = 'data-nwf-gmb-cat-for';
export const CATEGORY_SIGNATURE_ATTR = 'data-nwf-gmb-cat-signature';
export const CATEGORY_PANEL_ATTR = 'data-nwf-gmb-cat-panel';

export function categorySignature(categories: BusinessCategories): string {
  return [categories.primary, ...categories.secondary].join('\u001f');
}

export function ensureGmbCategoryStyles(): void {
  if (document.getElementById(GMB_CATEGORY_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = GMB_CATEGORY_STYLE_ID;
  style.textContent = `
    .nwf-gmb-cat-wrap {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 6px 8px;
      padding: 8px 0 6px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      position: relative;
      z-index: 9998;
      pointer-events: auto;
      width: 100%;
      box-sizing: border-box;
    }
    /* Listing shells are flex rows — force our own line instead of squeezing. */
    .nwf-gmb-cat-wrap.is-search-listing {
      padding: 4px 0 2px;
      margin: 2px 0 0;
      flex-basis: 100%;
      min-width: 100%;
      align-items: center;
    }
    .nwf-gmb-cat-wrap.is-detail-panel {
      padding: 8px 24px 10px;
      border-bottom: 1px solid rgba(60, 64, 67, 0.08);
    }
    .nwf-gmb-cat-label {
      flex: 0 0 auto;
      font-weight: 600;
      color: #3c4043;
      margin-top: 2px;
    }
    .nwf-gmb-cat-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      flex: 1 1 auto;
      min-width: 0;
    }
    .nwf-gmb-cat-pill {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f3e8d8;
      color: #5f4b32;
      border: 1px solid rgba(95, 75, 50, 0.18);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 10px;
      font-weight: 500;
    }
    .nwf-gmb-cat-pill.is-primary {
      background: #ede0c8;
      border-color: rgba(95, 75, 50, 0.28);
      font-weight: 600;
    }
    @media (prefers-color-scheme: dark) {
      .nwf-gmb-cat-label {
        color: #e8eaed;
      }
    }
  `;
  document.documentElement.appendChild(style);
}

export function renderCategoryPills(
  container: HTMLElement,
  categories: BusinessCategories,
  labelText = 'GMB Cat.:'
): void {
  container.replaceChildren();

  const label = document.createElement('span');
  label.className = 'nwf-gmb-cat-label';
  label.textContent = labelText;
  container.appendChild(label);

  const pills = document.createElement('div');
  pills.className = 'nwf-gmb-cat-pills';

  const primary = document.createElement('span');
  primary.className = 'nwf-gmb-cat-pill is-primary';
  primary.textContent = `\u2B50 ${categories.primary}`;
  primary.title = categories.primary;
  pills.appendChild(primary);

  for (const name of categories.secondary) {
    const pill = document.createElement('span');
    pill.className = 'nwf-gmb-cat-pill';
    pill.textContent = name;
    pill.title = name;
    pills.appendChild(pill);
  }

  container.appendChild(pills);
}

export function mountCategoryRow(
  options: {
    placeId: string;
    categories: BusinessCategories;
    parent: HTMLElement;
    before: Element | null;
    labelText?: string;
    isDetailPanel?: boolean;
    isSearchListing?: boolean;
  }
): HTMLElement {
  ensureGmbCategoryStyles();

  const signature = categorySignature(options.categories);
  const existing = options.isDetailPanel
    ? options.parent.querySelector<HTMLElement>(
        `[${CATEGORY_ATTR}="${CSS.escape(options.placeId)}"][${CATEGORY_PANEL_ATTR}="1"]`
      )
    : options.parent.querySelector<HTMLElement>(
        `[${CATEGORY_ATTR}="${CSS.escape(options.placeId)}"]:not([${CATEGORY_PANEL_ATTR}])`
      );

  if (existing?.getAttribute(CATEGORY_SIGNATURE_ATTR) === signature) {
    return existing;
  }

  let wrap = existing;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'nwf-gmb-cat-wrap';
    if (options.isDetailPanel) wrap.classList.add('is-detail-panel');
    if (options.isSearchListing) wrap.classList.add('is-search-listing');
    wrap.setAttribute(CATEGORY_ATTR, options.placeId);
    if (options.isDetailPanel) wrap.setAttribute(CATEGORY_PANEL_ATTR, '1');

    if (options.before) {
      options.parent.insertBefore(wrap, options.before);
    } else {
      options.parent.appendChild(wrap);
    }
  }

  wrap.setAttribute(CATEGORY_SIGNATURE_ATTR, signature);
  wrap.classList.toggle('is-search-listing', options.isSearchListing === true);
  renderCategoryPills(wrap, options.categories, options.labelText);
  return wrap;
}
