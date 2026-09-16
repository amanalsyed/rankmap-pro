export interface WhiteLabelSettings {
  /** Show agency branding on exported audit PDFs. */
  enabled: boolean;
  /** Show agency branding at the top of the audit report page in the extension. */
  showOnAuditPage: boolean;
  agencyName: string;
  tagline: string;
  /** Base64 data URL (png/jpeg/webp), max ~200 KB. */
  logoDataUrl: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

export const WHITE_LABEL_SETTINGS_KEY = 'whiteLabelSettings';

export const DEFAULT_WHITE_LABEL_SETTINGS: WhiteLabelSettings = {
  enabled: false,
  showOnAuditPage: true,
  agencyName: '',
  tagline: '',
  logoDataUrl: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
};

export const MAX_LOGO_BYTES = 200 * 1024;

function trimField(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normalizeWhiteLabelSettings(
  raw: Partial<WhiteLabelSettings> | null | undefined
): WhiteLabelSettings {
  const defaults = DEFAULT_WHITE_LABEL_SETTINGS;
  let logoDataUrl = trimField(raw?.logoDataUrl, 300_000);
  if (logoDataUrl && !logoDataUrl.startsWith('data:image/')) {
    logoDataUrl = '';
  }

  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : defaults.enabled,
    showOnAuditPage:
      typeof raw?.showOnAuditPage === 'boolean' ? raw.showOnAuditPage : defaults.showOnAuditPage,
    agencyName: trimField(raw?.agencyName, 120),
    tagline: trimField(raw?.tagline, 200),
    logoDataUrl,
    contactEmail: trimField(raw?.contactEmail, 120),
    contactPhone: trimField(raw?.contactPhone, 40),
    website: trimField(raw?.website, 200),
  };
}

export function hasWhiteLabelContent(settings: WhiteLabelSettings): boolean {
  return Boolean(
    settings.agencyName ||
      settings.logoDataUrl ||
      settings.contactEmail ||
      settings.contactPhone ||
      settings.website
  );
}

/** Agency branding on exported audit PDFs / CSV metadata. */
export function isWhiteLabelActive(settings: WhiteLabelSettings): boolean {
  return settings.enabled && hasWhiteLabelContent(settings);
}

/** Agency branding header on the in-extension audit report page. */
export function isWhiteLabelVisibleOnAuditPage(settings: WhiteLabelSettings): boolean {
  return settings.showOnAuditPage && hasWhiteLabelContent(settings);
}

export function formatWhiteLabelContact(settings: WhiteLabelSettings): string {
  const parts: string[] = [];
  if (settings.contactEmail) parts.push(settings.contactEmail);
  if (settings.contactPhone) parts.push(settings.contactPhone);
  if (settings.website) parts.push(settings.website);
  return parts.join(' · ');
}

export async function readWhiteLabelSettings(): Promise<WhiteLabelSettings> {
  const data = await chrome.storage.local.get(WHITE_LABEL_SETTINGS_KEY);
  return normalizeWhiteLabelSettings(data[WHITE_LABEL_SETTINGS_KEY] as Partial<WhiteLabelSettings>);
}

export async function writeWhiteLabelSettings(settings: WhiteLabelSettings): Promise<WhiteLabelSettings> {
  const normalized = normalizeWhiteLabelSettings(settings);
  await chrome.storage.local.set({ [WHITE_LABEL_SETTINGS_KEY]: normalized });
  chrome.runtime.sendMessage({ type: 'WHITE_LABEL_SETTINGS_UPDATE', settings: normalized }).catch(() => {});
  return normalized;
}
