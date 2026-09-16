import type { BusinessLead } from '../types';
import type { Plan } from '../supabase/types';
import { cleanBusinessName } from '../utils/business-name';
import type { EnrichmentPlatformSettings } from '../settings/enrichment-settings';
import { DEFAULT_ENRICHMENT_SETTINGS } from '../settings/enrichment-settings';

/**
 * Get allowed social platforms based on plan.
 * Free users only get Facebook, LinkedIn, Instagram.
 * Paid users get all social platforms + directories.
 */
function getAllowedSocialPlatforms(plan?: Plan): string[] {
  if (plan === 'free') {
    // Free: Only these 3 social platforms, no directories
    return ['facebook', 'linkedin', 'instagram'];
  }
  // Paid users: All social platforms + directories
  return [
    'facebook', 'instagram', 'linkedin', 'twitter', 'tiktok',
    'yelp', 'yellowpages', 'bbb', 'angi', 'thumbtack', 
    'manta', 'foursquare', 'mapquest'
  ];
}

export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export interface SearchParseResult {
  links: string[];
  emails: string[];
  text: string;
  results: SearchResultItem[];
}

export interface SearchQuery {
  query: string;
  purpose: 'social' | 'email' | 'owner';
  platform?: string;
}

export function buildSearchQueries(
  name: string,
  location: string,
  category: string,
  platforms: EnrichmentPlatformSettings = DEFAULT_ENRICHMENT_SETTINGS.platforms,
  plan?: Plan
): SearchQuery[] {
  const allowedSocialPlatforms = getAllowedSocialPlatforms(plan);
  const city = location.split(',')[0]?.trim() || location;
  const cleanedName = cleanBusinessName(name);
  const quoted = `"${cleanedName}"`;
  const loc = city ? ` ${city}` : '';

  const all: SearchQuery[] = [
    { query: `${quoted}${loc} facebook`, purpose: 'social' as const, platform: 'facebook' },
    { query: `${quoted}${loc} instagram`, purpose: 'social' as const, platform: 'instagram' },
    { query: `${quoted}${loc} linkedin`, purpose: 'social' as const, platform: 'linkedin' },
    { query: `${quoted}${loc} twitter OR x.com`, purpose: 'social' as const, platform: 'twitter' },
    { query: `${quoted}${loc} tiktok`, purpose: 'social' as const, platform: 'tiktok' },
    { query: `${quoted}${loc} yelp`, purpose: 'social' as const, platform: 'yelp' },
    { query: `${quoted}${loc} yellowpages`, purpose: 'social' as const, platform: 'yellowpages' },
    { query: `${quoted}${loc} bbb.org`, purpose: 'social' as const, platform: 'bbb' },
    { query: `${quoted}${loc} angi.com`, purpose: 'social' as const, platform: 'angi' },
    { query: `${quoted}${loc} thumbtack`, purpose: 'social' as const, platform: 'thumbtack' },
    { query: `${quoted}${loc} manta.com`, purpose: 'social' as const, platform: 'manta' },
    { query: `${quoted}${loc} foursquare`, purpose: 'social' as const, platform: 'foursquare' },
    { query: `${quoted}${loc} mapquest`, purpose: 'social' as const, platform: 'mapquest' },
    { query: `${quoted}${loc} email OR contact email`, purpose: 'email' as const },
    { query: `${quoted}${loc} contact`, purpose: 'email' as const },
    { query: `${quoted}${loc} owner OR founder OR CEO OR president`, purpose: 'owner' as const },
    { query: `${quoted}${loc} ${category} linkedin owner`, purpose: 'owner' as const },
  ];

  return all.filter((item) => {
    if (item.query.trim().length <= 3) return false;
    
    // ===== FREE PLAN RESTRICTIONS (checked first) =====
    if (plan === 'free') {
      // Free users: NO email enrichment at all
      if (item.purpose === 'email') {
        return false;
      }
      
      // Free users: NO owner enrichment at all
      if (item.purpose === 'owner') {
        return false;
      }
      
      // Free users: ONLY Facebook, LinkedIn, Instagram
      if (item.purpose === 'social' && item.platform) {
        if (!allowedSocialPlatforms.includes(item.platform)) {
          return false;
        }
      }
    }
    
    // ===== USER SETTINGS (checked after plan restrictions) =====
    if (item.purpose === 'social' && item.platform) {
      // Check if platform is enabled in user settings
      return platforms[item.platform as keyof EnrichmentPlatformSettings] ?? false;
    }
    if (item.purpose === 'email') return platforms.email;
    if (item.purpose === 'owner') return platforms.owner;
    return true;
  });
}

export function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=10`;
}

const SKIP_EMAIL_HOSTS = [
  'google.com',
  'gstatic.com',
  'schema.org',
  'w3.org',
  'example.com',
  'sentry.io',
  'wixpress.com',
  'cloudflare.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tiktok.com',
  'googleusercontent.com',
  'yelp.com',
  'yellowpages.com',
  'bbb.org',
  'angi.com',
  'angieslist.com',
  'thumbtack.com',
  'manta.com',
  'foursquare.com',
  'mapquest.com',
];

const PERSONAL_EMAIL_HOSTS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];

export function isUsefulEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
  if (lower.includes('noreply') || lower.includes('no-reply') || lower.includes('donotreply')) return false;
  return !SKIP_EMAIL_HOSTS.some((host) => lower.endsWith(`@${host}`));
}

export function isBusinessEmail(email: string, businessName: string): boolean {
  const lower = email.toLowerCase();
  const host = lower.split('@')[1] ?? '';
  if (PERSONAL_EMAIL_HOSTS.includes(host)) return false;
  const tokens = tokenize(businessName);
  const local = lower.split('@')[0] ?? '';
  if (tokens.some((t) => t.length > 3 && local.includes(t))) return true;
  if (['info', 'contact', 'hello', 'office', 'sales', 'support', 'admin', 'service'].some((p) => local.startsWith(p))) {
    return true;
  }
  return !PERSONAL_EMAIL_HOSTS.includes(host) && !host.includes('google');
}

export function classifySocialUrl(url: string): { network: string; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = parsed.pathname.replace(/\/$/, '');

  if (/facebook\.com$/.test(host) || host === 'fb.com' || host === 'fb.me') {
    if (/\/(login|share|sharer|dialog|help|privacy|policies|watch|groups|events|photo)/i.test(path)) return null;
    if (path.length < 2 || path === '/pages') return null;
    return { network: 'facebook', url: parsed.origin + path };
  }

  if (host === 'instagram.com' || host === 'instagr.am') {
    if (/\/(accounts|login|legal|p\/|reel\/|stories\/|explore\/)/i.test(path)) return null;
    if (path.length < 2) return null;
    return { network: 'instagram', url: parsed.origin + path };
  }

  if (host === 'linkedin.com') {
    if (!/\/(company|in|school)\//i.test(path)) return null;
    return { network: 'linkedin', url: parsed.origin + path.split('?')[0] };
  }

  if (host === 'twitter.com' || host === 'x.com') {
    if (/\/(intent|share|login|home|privacy|search|hashtag|i\/)/i.test(path)) return null;
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    return { network: 'twitter', url: parsed.origin + path };
  }

  if (host === 'youtube.com' || host === 'youtu.be') {
    if (!/\/(@|channel\/|c\/|user\/)/i.test(path) && host !== 'youtu.be') return null;
    return { network: 'youtube', url: parsed.origin + path.split('?')[0] };
  }

  if (host === 'tiktok.com') {
    if (!path.includes('@')) return null;
    return { network: 'tiktok', url: parsed.origin + path.split('?')[0] };
  }

  if (/yelp\.com$/.test(host)) {
    if (!/\/biz\//i.test(path)) return null;
    return { network: 'yelp', url: parsed.origin + path.split('?')[0] };
  }

  if (/yellowpages\.com$/.test(host)) {
    if (path.length < 3) return null;
    return { network: 'yellowpages', url: parsed.origin + path.split('?')[0] };
  }

  if (host === 'bbb.org' || /bbb\.org$/.test(host)) {
    if (!/\/business\//i.test(path) && !/\/profile\//i.test(path)) return null;
    return { network: 'bbb', url: parsed.origin + path.split('?')[0] };
  }

  if (host === 'angi.com' || host === 'angieslist.com') {
    if (!/\/companylist\//i.test(path) && !/\/company\//i.test(path)) return null;
    return { network: 'angi', url: parsed.origin + path.split('?')[0] };
  }

  if (/thumbtack\.com$/.test(host)) {
    if (path.length < 3 || /^\/(home|login|signup|about)/i.test(path)) return null;
    return { network: 'thumbtack', url: parsed.origin + path.split('?')[0] };
  }

  if (/manta\.com$/.test(host)) {
    if (!/\/company\//i.test(path)) return null;
    return { network: 'manta', url: parsed.origin + path.split('?')[0] };
  }

  if (/foursquare\.com$/.test(host)) {
    if (!/\/v\//i.test(path)) return null;
    return { network: 'foursquare', url: parsed.origin + path.split('?')[0] };
  }

  if (/mapquest\.com$/.test(host)) {
    if (!/\/us\//i.test(path) && !/\/place\//i.test(path)) return null;
    return { network: 'mapquest', url: parsed.origin + path.split('?')[0] };
  }

  return null;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function businessMatchesContext(text: string, lead: BusinessLead): boolean {
  const haystack = text.toLowerCase();
  const nameTokens = tokenize(lead.name);
  if (nameTokens.length === 0) return false;

  const matched = nameTokens.filter((token) => haystack.includes(token)).length;
  const required = Math.max(1, Math.ceil(nameTokens.length * 0.6));
  if (matched < required) return false;

  const city = lead.address.split(',')[0]?.trim().toLowerCase();
  if (city && city.length > 3 && !haystack.includes(city)) {
    const stateMatch = lead.address.match(/\b([A-Z]{2})\b/);
    if (stateMatch && !haystack.includes(stateMatch[1].toLowerCase())) {
      return matched >= nameTokens.length;
    }
  }

  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, '').slice(-7);
    if (digits.length >= 7 && haystack.replace(/\D/g, '').includes(digits)) return true;
  }

  if (lead.category && haystack.includes(lead.category.toLowerCase().split(' ')[0])) return true;

  return matched >= required;
}

export function socialProfileMatchesBusiness(
  url: string,
  text: string,
  lead: BusinessLead,
  platform: string
): boolean {
  const combined = `${url} ${text}`.toLowerCase();
  if (!businessMatchesContext(combined, lead)) return false;

  const slug = url.split('/').filter(Boolean).pop()?.replace(/[^a-z0-9]/gi, '') ?? '';
  const nameSlug = lead.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (slug && nameSlug && (slug.includes(nameSlug.slice(0, 6)) || nameSlug.includes(slug.slice(0, 6)))) {
    return true;
  }

  if (platform === 'linkedin' && /\/company\//i.test(url)) {
    return businessMatchesContext(text, lead);
  }

  return businessMatchesContext(text, lead);
}

const OWNER_NAME_WORD = '[A-Z][a-z][a-z\'-.]*';
const OWNER_NAME = `${OWNER_NAME_WORD}(?:\\s+${OWNER_NAME_WORD}){1,3}`;

/** SERP / LinkedIn boilerplate that is often captured after a stray "Owner" token. */
const OWNER_NAME_STOP_WORDS = new Set([
  'profile',
  'view',
  'linkedin',
  'professional',
  'network',
  'business',
  'company',
  'full',
  'connect',
  'sign',
  'login',
  'website',
  'page',
  'email',
  'phone',
  'contact',
  'services',
  'local',
  'directory',
  'listing',
  'read',
  'more',
  'see',
  'click',
  'here',
  'about',
  'official',
  'verified',
  'welcome',
  'learn',
  'member',
  'public',
  'account',
  'search',
  'results',
  'people',
  'employees',
  'staff',
  'team',
]);

function isPlausibleOwnerName(name: string): boolean {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return false;

  const words = trimmed.split(' ');
  if (words.length < 2 || words.length > 4) return false;

  for (const word of words) {
    const normalized = word.toLowerCase().replace(/[^a-z'-]/g, '');
    if (normalized.length < 2) return false;
    if (OWNER_NAME_STOP_WORDS.has(normalized)) return false;
    if (!/^[A-Z][a-z'-.]*[a-z.-]$|^[A-Z]\.$/.test(word)) return false;
  }

  return true;
}

const OWNER_PATTERNS = [
  // LinkedIn / SERP titles: "Jane Doe - Owner - Company | LinkedIn"
  new RegExp(`(${OWNER_NAME})\\s+[-–|]\\s+[^\\n|]{0,80}\\b(?:owner|founder|ceo|president)\\b`, 'i'),
  /(?:owned by|founded by|run by)\s+([A-Z][a-z][a-z'-.]*(?:\s+[A-Z][a-z][a-z'-.]*){1,3})/i,
  /([A-Z][a-z][a-z'-.]*(?:\s+[A-Z][a-z][a-z'-.]*){1,3}),?\s+(?:owner|founder|ceo|president)\s+of\b/i,
  /([A-Z][a-z][a-z'-.]*(?:\s+[A-Z][a-z][a-z'-.]*){1,3})\s+-\s+(?:owner|founder|ceo)\b/i,
  // Avoid "Business Owner profile on Professional …"
  new RegExp(
    `(?<!(?:business|company|profile)\\s)(?:owner|founder|co-founder|ceo|president|proprietor|managing director)[:\\s-]+(${OWNER_NAME})\\b`,
    'i'
  ),
];

const TITLE_PATTERNS = [
  { pattern: /\b(?:ceo|chief executive officer)\b/i, title: 'CEO' },
  { pattern: /\b(?:owner|business owner)\b/i, title: 'Owner' },
  { pattern: /\b(?:founder|co-founder)\b/i, title: 'Founder' },
  { pattern: /\b(?:president)\b/i, title: 'President' },
  { pattern: /\b(?:managing director)\b/i, title: 'Managing Director' },
];

export function extractOwnerInfo(
  text: string,
  lead: BusinessLead
): { name: string; title: string; linkedIn: string; source: string } | null {
  if (!businessMatchesContext(text, lead)) return null;

  let name = '';
  for (const pattern of OWNER_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].trim().replace(/\s+/g, ' ');
    if (!isPlausibleOwnerName(candidate)) continue;
    name = candidate;
    break;
  }

  if (!name) return null;

  if (lead.name.toLowerCase().includes(name.toLowerCase())) return null;

  let title = 'Owner';
  for (const { pattern, title: t } of TITLE_PATTERNS) {
    if (pattern.test(text)) {
      title = t;
      break;
    }
  }

  const linkedInMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"')]+/i);
  const linkedIn = linkedInMatch ? linkedInMatch[0].split('?')[0] : '';

  return { name, title, linkedIn, source: '' };
}

export function pickBestEmails(emails: string[], lead: BusinessLead): string[] {
  const verified = emails.filter((email) => isUsefulEmail(email));
  const scored = verified.map((email) => ({
    email,
    score: isBusinessEmail(email, lead.name) ? 2 : 1,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.email).slice(0, 3);
}
