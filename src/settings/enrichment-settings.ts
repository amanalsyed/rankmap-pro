export interface EnrichmentPlatformSettings {
  facebook: boolean;
  instagram: boolean;
  linkedin: boolean;
  twitter: boolean;
  tiktok: boolean;
  email: boolean;
  owner: boolean;
  yelp: boolean;
  yellowpages: boolean;
  bbb: boolean;
  angi: boolean;
  thumbtack: boolean;
  manta: boolean;
  foursquare: boolean;
  mapquest: boolean;
}

export interface EnrichmentSettings {
  /** Run Google Search enrichment automatically after each lead is found. */
  enrichDuringScan: boolean;
  /** Run contact enrichment after a GBP audit completes (any business, including with a website). */
  enrichAfterGbpAudit: boolean;
  platforms: EnrichmentPlatformSettings;
  /** Pause between Google Search requests (ms). Higher = safer, slower. */
  searchDelayMs: number;
  /** Parallel Google Search tabs per lead (1 = sequential, safest). */
  maxConcurrentSearches: number;
}

export const ENRICHMENT_SETTINGS_KEY = 'enrichmentSettings';

export const DEFAULT_ENRICHMENT_SETTINGS: EnrichmentSettings = {
  enrichDuringScan: true,
  enrichAfterGbpAudit: false,
  platforms: {
    facebook: true,
    instagram: true,
    linkedin: true,
    twitter: true,
    tiktok: true,
    email: true,
    owner: true,
    yelp: true,
    yellowpages: true,
    bbb: true,
    angi: true,
    thumbtack: true,
    manta: true,
    foursquare: true,
    mapquest: true,
  },
  searchDelayMs: 800,
  maxConcurrentSearches: 1,
};

const PLATFORM_KEYS = Object.keys(
  DEFAULT_ENRICHMENT_SETTINGS.platforms
) as (keyof EnrichmentPlatformSettings)[];

export function normalizeEnrichmentSettings(
  raw: Partial<EnrichmentSettings> | null | undefined
): EnrichmentSettings {
  const defaults = DEFAULT_ENRICHMENT_SETTINGS;
  const platforms = { ...defaults.platforms };
  if (raw?.platforms) {
    for (const key of PLATFORM_KEYS) {
      if (typeof raw.platforms[key] === 'boolean') {
        platforms[key] = raw.platforms[key];
      }
    }
  }

  const searchDelayMs =
    typeof raw?.searchDelayMs === 'number'
      ? Math.max(400, Math.min(3000, Math.round(raw.searchDelayMs)))
      : defaults.searchDelayMs;

  const maxConcurrentSearches =
    typeof raw?.maxConcurrentSearches === 'number'
      ? Math.max(1, Math.min(3, Math.round(raw.maxConcurrentSearches)))
      : defaults.maxConcurrentSearches;

  return {
    enrichDuringScan:
      typeof raw?.enrichDuringScan === 'boolean' ? raw.enrichDuringScan : defaults.enrichDuringScan,
    enrichAfterGbpAudit:
      typeof raw?.enrichAfterGbpAudit === 'boolean'
        ? raw.enrichAfterGbpAudit
        : defaults.enrichAfterGbpAudit,
    platforms,
    searchDelayMs,
    maxConcurrentSearches,
  };
}

export async function readEnrichmentSettings(): Promise<EnrichmentSettings> {
  const data = await chrome.storage.local.get(ENRICHMENT_SETTINGS_KEY);
  return normalizeEnrichmentSettings(data[ENRICHMENT_SETTINGS_KEY] as Partial<EnrichmentSettings>);
}

export async function writeEnrichmentSettings(settings: EnrichmentSettings): Promise<EnrichmentSettings> {
  const normalized = normalizeEnrichmentSettings(settings);
  await chrome.storage.local.set({ [ENRICHMENT_SETTINGS_KEY]: normalized });
  chrome.runtime.sendMessage({ type: 'ENRICHMENT_SETTINGS_UPDATE', settings: normalized }).catch(() => {});
  return normalized;
}

export function enrichmentSearchEnabled(settings: EnrichmentSettings): boolean {
  return settings.enrichDuringScan || settings.enrichAfterGbpAudit;
}

export function enabledPlatformCount(settings: EnrichmentSettings): number {
  return PLATFORM_KEYS.filter((key) => settings.platforms[key]).length;
}
