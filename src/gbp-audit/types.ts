import type { GbpAudit } from '../audit/types';
import type { EnrichmentFields } from '../types';

export interface StandaloneGbpAuditRequest {
  placeId: string;
  name: string;
  mapsUrl: string;
  category?: string;
  address?: string;
  phone?: string;
  rating?: string;
  reviews?: string;
  /** Knowledge-graph id (`/g/…`) of the local pack card, when audited from Search. */
  kgMid?: string;
}

export interface StandaloneGbpAuditEntry extends EnrichmentFields {
  placeId: string;
  name: string;
  mapsUrl: string;
  audit: GbpAudit;
  auditedAt: string;
}

export interface GbpAuditStore {
  entries: Record<string, StandaloneGbpAuditEntry>;
  /** Saved audit reports (newest first). */
  history: GbpAuditHistoryEntry[];
}

export type GbpAuditHistorySource = 'standalone' | 'scan';

export interface GbpAuditHistoryEntry extends StandaloneGbpAuditEntry {
  id: string;
  source: GbpAuditHistorySource;
  /** Scan-embedded audit: lead id in the active/saved session. */
  leadId?: string;
}

export function emptyGbpAuditStore(): GbpAuditStore {
  return { entries: {}, history: [] };
}
