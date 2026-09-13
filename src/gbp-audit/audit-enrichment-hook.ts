import type { BusinessLead } from '../types';

/** Registered by the service worker to run contact enrichment after GBP audits. */
let auditEnrichmentHandler: ((lead: BusinessLead) => void) | null = null;

export function setAuditEnrichmentHandler(handler: ((lead: BusinessLead) => void) | null): void {
  auditEnrichmentHandler = handler;
}

export function triggerAuditEnrichment(lead: BusinessLead): void {
  auditEnrichmentHandler?.(lead);
}
