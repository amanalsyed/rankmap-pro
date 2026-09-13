/**
 * Reads Services / Areas served out of the Google Search "local place viewer".
 *
 * Neither field exists in Maps' JSPB payload or on the `ludocid` knowledge panel — the
 * place viewer is the only surface that carries them, and it only opens by clicking a
 * card in the local results vertical, so this drives that interaction.
 */

import { sleep } from './dom-utils';

const SERVICE_AREA_ATTR = 'data-service-area-description';
const SERVICES_LABEL_RE = /^services\s*:/i;
const SERVICES_DIALOG_RE = /^services/i;

const MAX_ITEMS = 400;

async function waitFor<T>(probe: () => T | null, timeoutMs = 6000, stepMs = 150): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(stepMs);
  }
}

function textOf(el: Element | null | undefined): string {
  return ((el?.textContent ?? '') as string).replace(/\s+/g, ' ').trim();
}

function isVisible(el: Element): boolean {
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.slice(0, MAX_ITEMS);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Ad cards carry a bare `id="pv-"`, so only `pv-/g/…` nodes are real listings. Prefer an
 * exact knowledge-graph match; otherwise match the name and confirm it with the street
 * number so a common name can't select the wrong branch.
 */
function findCardTrigger(kgMid: string | null, name: string, address: string): HTMLElement | null {
  const nodes = [...document.querySelectorAll<HTMLElement>('[id^="pv-/g/"]')];

  if (kgMid) {
    const exact = nodes.find((node) => node.id === `pv-${kgMid}`);
    if (exact) return exact;
  }

  const wanted = normalize(name);
  if (!wanted) return null;

  const streetNumber = address.match(/\b\d{1,6}\b/)?.[0] ?? '';
  let best: HTMLElement | null = null;
  let bestScore = 0;

  for (const node of nodes) {
    const text = normalize(textOf(node));
    if (!text.includes(wanted)) continue;

    const score = 1 + (streetNumber && text.includes(` ${streetNumber} `) ? 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

/**
 * Areas ship inline on the summary row as `%.@."New York",[…areas…],"Plumbing NYC"]`
 * — a JSON array tail behind a marker, so no dialog needs opening.
 */
function parseServiceAreaAttribute(raw: string): string[] {
  const marker = raw.indexOf('%.@.');
  const tail = marker >= 0 ? raw.slice(marker + 4) : raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(`[${tail}`);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  for (const entry of parsed) {
    if (Array.isArray(entry) && entry.length > 0 && entry.every((v) => typeof v === 'string')) {
      return dedupe(entry as string[]);
    }
  }
  return [];
}

function readServiceAreas(): string[] {
  for (const el of document.querySelectorAll(`[${SERVICE_AREA_ATTR}]`)) {
    const areas = parseServiceAreaAttribute(el.getAttribute(SERVICE_AREA_ATTR) ?? '');
    if (areas.length > 0) return areas;
  }
  return [];
}

function clickableAncestor(el: Element): HTMLElement | null {
  let node: Element | null = el;
  for (let i = 0; i < 6 && node; i++) {
    if (
      node instanceof HTMLElement &&
      (node.tagName === 'BUTTON' ||
        node.tagName === 'A' ||
        node.getAttribute('role') === 'button' ||
        node.hasAttribute('jsaction'))
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * The Services row is a button whose own text is the entire service list, so match the
 * bold "Services:" label inside it rather than the row's text.
 */
function findServicesRow(): HTMLElement | null {
  for (const label of document.querySelectorAll('b, strong, span, div')) {
    if (label.children.length > 0) continue;
    if (!SERVICES_LABEL_RE.test(textOf(label))) continue;

    const clickable = clickableAncestor(label);
    if (clickable && isVisible(clickable)) return clickable;
  }
  return null;
}

/** Last resort: the row text itself, as "Services: a, b, c … y and z". */
function parseServicesFromRow(row: Element): string[] {
  const text = textOf(row).replace(/^services\s*:\s*/i, '');
  if (!text) return [];

  const parts = text.split(/,\s*/);
  const last = parts.pop() ?? '';
  const tail = last.split(/\s+and\s+/i);
  return dedupe([...parts, ...tail]);
}

/**
 * Pull the item list out of an open dialog. Services render as bare
 * `<div>Drain cleaning</div>`; areas wrap an svg tick plus a label in the same
 * container. Both reduce to a run of sibling divs each holding one short string, so
 * match on that shape rather than Google's rotating class names.
 */
function readDialogItems(dialog: Element): string[] {
  let best: string[] = [];

  for (const box of dialog.querySelectorAll('div')) {
    const kids = [...box.children];
    if (kids.length < 3 || kids.length > MAX_ITEMS) continue;
    if (!kids.every((kid) => kid.tagName === 'DIV')) continue;

    const texts = kids.map(textOf);
    if (!texts.every((text) => text.length >= 2 && text.length <= 80)) continue;
    if (texts.length > best.length) best = texts;
  }
  return dedupe(best);
}

function openDialogFor(label: RegExp): Element | null {
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    if (!isVisible(dialog)) continue;
    if (label.test(textOf(dialog).slice(0, 60))) return dialog;
  }
  return null;
}

function closeDialog(): void {
  for (const type of ['keydown', 'keyup'] as const) {
    document.dispatchEvent(
      new KeyboardEvent(type, { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
    );
  }
}

/**
 * Open the Services dialog and read its rows. The summary row lists the same services
 * but comma-joined, which corrupts names that contain commas ("Pipe Upgrades,
 * Replacement, & Relining"), so it is only a fallback.
 */
async function readServices(): Promise<string[]> {
  const row = findServicesRow();
  if (!row) return [];

  row.click();
  const dialog = await waitFor(() => openDialogFor(SERVICES_DIALOG_RE), 5000);

  if (dialog) {
    const items = readDialogItems(dialog);
    closeDialog();
    await waitFor(() => (openDialogFor(SERVICES_DIALOG_RE) ? null : true), 1500);
    if (items.length > 0) return items;
  }

  return parseServicesFromRow(row);
}

interface HarvestResult {
  ok: boolean;
  reason?: string;
  services: string[];
  serviceAreas: string[];
}

async function harvest(
  kgMid: string | null,
  name: string,
  address: string
): Promise<HarvestResult> {
  const card = findCardTrigger(kgMid, name, address);
  if (!card) return { ok: false, reason: 'listing-not-on-page', services: [], serviceAreas: [] };

  card.click();

  const ready = await waitFor(
    () => findServicesRow() ?? document.querySelector(`[${SERVICE_AREA_ATTR}]`),
    8000
  );
  if (!ready) {
    return { ok: false, reason: 'place-viewer-did-not-open', services: [], serviceAreas: [] };
  }

  const serviceAreas = readServiceAreas();
  const services = await readServices();

  return { ok: true, services, serviceAreas };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'HARVEST_PLACE_PROFILE_PING') {
    sendResponse({ ok: true });
    return undefined;
  }

  if (message?.type === 'HARVEST_PLACE_PROFILE') {
    void harvest(message.kgMid ?? null, message.name ?? '', message.address ?? '')
      .then(sendResponse)
      .catch(() =>
        sendResponse({ ok: false, reason: 'harvest-failed', services: [], serviceAreas: [] })
      );
    return true;
  }

  return undefined;
});
