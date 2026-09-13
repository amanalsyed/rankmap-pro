import { sanitizePlaceId } from '../content/maps-id-utils';

const HEX_FID_RE = /^0x[a-f0-9]+:0x[a-f0-9]+$/i;
const CID_PREFIX_RE = /^cid:(\d+)$/i;

/** Accept ChIJ, hex feature ids, decimal CIDs, and name fallbacks for standalone audits. */
export function normalizeStandalonePlaceId(placeId: string): string | null {
  const trimmed = placeId.trim();
  if (!trimmed) return null;

  const chij = sanitizePlaceId(trimmed);
  if (chij) return chij;

  const chijInline = trimmed.match(/(ChIJ[a-zA-Z0-9_-]{10,})/)?.[1];
  if (chijInline) return chijInline;

  if (HEX_FID_RE.test(trimmed)) return trimmed.toLowerCase();

  const cid = trimmed.match(CID_PREFIX_RE);
  if (cid) return `cid:${cid[1]}`;

  if (trimmed.startsWith('name:') && trimmed.length > 5) return trimmed;

  return trimmed.length >= 3 ? trimmed : null;
}

export function decimalCidFromHexFid(hexFid: string | null | undefined): string | null {
  const parts = hexFid?.split(':') ?? [];
  if (parts.length !== 2) return null;
  try {
    return BigInt(parts[1]).toString(10);
  } catch {
    return null;
  }
}
