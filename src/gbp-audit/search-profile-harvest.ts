import { waitForTabLoad } from './audit-tab';

export interface SearchProfileFields {
  services: string[];
  serviceAreas: string[];
}

let harvestTabId: number | null = null;

async function ensureHarvestTab(url: string): Promise<number | null> {
  if (harvestTabId !== null) {
    try {
      await chrome.tabs.get(harvestTabId);
      await chrome.tabs.update(harvestTabId, { url, active: false });
      return harvestTabId;
    } catch {
      harvestTabId = null;
    }
  }

  const tab = await chrome.tabs.create({ url, active: false });
  harvestTabId = tab.id ?? null;
  return harvestTabId;
}

export async function closeHarvestTab(): Promise<void> {
  if (harvestTabId === null) return;
  const id = harvestTabId;
  harvestTabId = null;
  try {
    await chrome.tabs.remove(id);
  } catch {
    // Tab already gone.
  }
}

async function waitForHarvester(tabId: number, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: 'HARVEST_PLACE_PROFILE_PING',
      })) as { ok?: boolean };
      if (res?.ok) return true;
    } catch {
      // Content script not injected yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Google's local results vertical — the only page that renders clickable place cards. */
function buildLocalResultsUrl(name: string, address: string): string {
  const query = [name, address].filter(Boolean).join(' ').slice(0, 200);
  return `https://www.google.com/search?udm=1&hl=en&q=${encodeURIComponent(query)}`;
}

/**
 * Services and service areas exist only in Google Search's local place viewer, which
 * has no addressable URL. The local results vertical does render clickable cards for a
 * plain name query, so open that and drive the matching card — this works whether the
 * audit started from Search or from Maps.
 */
export async function harvestSearchProfileFields(
  name: string,
  address: string,
  kgMid: string | null
): Promise<SearchProfileFields | null> {
  if (!name.trim()) return null;

  const tabId = await ensureHarvestTab(buildLocalResultsUrl(name, address));
  if (tabId === null) return null;

  await waitForTabLoad(tabId);
  if (!(await waitForHarvester(tabId))) return null;

  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'HARVEST_PLACE_PROFILE',
      kgMid,
      name,
      address,
    })) as { ok?: boolean; services?: string[]; serviceAreas?: string[] };

    if (!res?.ok) return null;
    return {
      services: res.services ?? [],
      serviceAreas: res.serviceAreas ?? [],
    };
  } catch {
    return null;
  }
}
