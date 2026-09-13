import type { BusinessLead } from '../types';

export type EmailConfidence = 'verified' | 'likely' | 'uncertain';

export interface ValidatedEmail {
  address: string;
  confidence: EmailConfidence;
}

const CONFIDENCE_RANK: Record<EmailConfidence, number> = {
  verified: 3,
  likely: 2,
  uncertain: 1,
};

const EMAIL_FORMAT =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const mxCache = new Map<string, boolean>();

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT.test(email.trim());
}

export function normalizeValidatedEmail(raw: unknown): ValidatedEmail | null {
  if (typeof raw === 'string') {
    const address = raw.trim().toLowerCase();
    if (!address) return null;
    return { address, confidence: 'uncertain' };
  }
  if (raw && typeof raw === 'object' && typeof (raw as ValidatedEmail).address === 'string') {
    const entry = raw as ValidatedEmail;
    const address = entry.address.trim().toLowerCase();
    if (!address) return null;
    const confidence = entry.confidence;
    if (confidence === 'verified' || confidence === 'likely' || confidence === 'uncertain') {
      return { address, confidence };
    }
    return { address, confidence: 'uncertain' };
  }
  return null;
}

export function normalizeEmailList(raw: unknown): ValidatedEmail[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: ValidatedEmail[] = [];
  for (const item of raw) {
    const normalized = normalizeValidatedEmail(item);
    if (!normalized || seen.has(normalized.address)) continue;
    seen.add(normalized.address);
    result.push(normalized);
  }
  return result;
}

export function getEmailAddresses(emails: ValidatedEmail[] | undefined): string[] {
  return (emails ?? []).map((e) => e.address);
}

export function mergeEmailRecords(
  existing: ValidatedEmail[],
  incoming: ValidatedEmail[]
): ValidatedEmail[] {
  const byAddress = new Map<string, ValidatedEmail>();
  for (const entry of [...existing, ...incoming]) {
    const prev = byAddress.get(entry.address);
    if (!prev || CONFIDENCE_RANK[entry.confidence] > CONFIDENCE_RANK[prev.confidence]) {
      byAddress.set(entry.address, entry);
    }
  }
  return [...byAddress.values()].sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  );
}

export function formatEmailConfidence(confidence: EmailConfidence): string {
  if (confidence === 'verified') return 'Verified';
  if (confidence === 'likely') return 'Likely';
  return 'Uncertain';
}

export function bestEmailConfidence(emails: ValidatedEmail[] | undefined): EmailConfidence | null {
  if (!emails?.length) return null;
  return emails.reduce(
    (best, entry) =>
      CONFIDENCE_RANK[entry.confidence] > CONFIDENCE_RANK[best] ? entry.confidence : best,
    emails[0].confidence
  );
}

async function queryMx(domain: string): Promise<boolean> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
  const response = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!response.ok) return false;

  const data = (await response.json()) as {
    Status?: number;
    Answer?: Array<{ type?: number; data?: string }>;
  };

  if (data.Status !== 0 || !data.Answer?.length) return false;
  return data.Answer.some((record) => record.type === 15 && Boolean(record.data));
}

export async function checkMxRecord(domain: string): Promise<boolean> {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return false;

  const cached = mxCache.get(normalized);
  if (cached !== undefined) return cached;

  try {
    const valid = await queryMx(normalized);
    mxCache.set(normalized, valid);
    return valid;
  } catch {
    mxCache.set(normalized, false);
    return false;
  }
}

export function applyMxToConfidence(
  entry: ValidatedEmail,
  mxValid: boolean | null
): ValidatedEmail {
  if (mxValid === false) {
    return { ...entry, confidence: 'uncertain' };
  }
  if (mxValid === true && entry.confidence === 'likely') {
    return { ...entry, confidence: 'verified' };
  }
  if (mxValid === true && entry.confidence === 'uncertain') {
    return { ...entry, confidence: 'likely' };
  }
  return entry;
}

export async function enrichEmailsWithMx(emails: ValidatedEmail[]): Promise<ValidatedEmail[]> {
  const domains = [...new Set(emails.map((e) => e.address.split('@')[1]?.toLowerCase()).filter(Boolean))];
  const mxResults = await Promise.all(
    domains.map(async (domain) => [domain, await checkMxRecord(domain)] as const)
  );
  const mxByDomain = new Map(mxResults);

  return emails.map((entry) => {
    const domain = entry.address.split('@')[1]?.toLowerCase() ?? '';
    const mxValid = domain ? (mxByDomain.get(domain) ?? null) : null;
    return applyMxToConfidence(entry, mxValid);
  });
}

export interface EmailCandidate {
  address: string;
  contextMatch: boolean;
}

export function scoreEmailCandidate(
  candidate: EmailCandidate,
  lead: BusinessLead,
  isUseful: (email: string) => boolean,
  isBusiness: (email: string, name: string) => boolean
): ValidatedEmail | null {
  const address = candidate.address.trim().toLowerCase();
  if (!isValidEmailFormat(address) || !isUseful(address)) return null;

  const businessFit = isBusiness(address, lead.name);
  if (candidate.contextMatch && businessFit) {
    return { address, confidence: 'likely' };
  }
  if (candidate.contextMatch || businessFit) {
    return { address, confidence: 'likely' };
  }
  return { address, confidence: 'uncertain' };
}

export function pickBestValidatedEmails(
  candidates: EmailCandidate[],
  lead: BusinessLead,
  isUseful: (email: string) => boolean,
  isBusiness: (email: string, name: string) => boolean
): ValidatedEmail[] {
  const scored: ValidatedEmail[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const entry = scoreEmailCandidate(candidate, lead, isUseful, isBusiness);
    if (!entry || seen.has(entry.address)) continue;
    seen.add(entry.address);
    scored.push(entry);
  }

  scored.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
  return scored.slice(0, 3);
}
