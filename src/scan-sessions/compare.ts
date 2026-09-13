import { computeOpportunityScore } from '../utils/opportunity-score';
import type { ScanSession } from './types';

export interface SessionCompareStats {
  leadCount: number;
  enrichedCount: number;
  auditedCount: number;
  avgOpportunityScore: number;
  topRankCount: number;
}

export interface SessionComparison {
  sessionA: ScanSession;
  sessionB: ScanSession;
  statsA: SessionCompareStats;
  statsB: SessionCompareStats;
  sharedLeadIds: string[];
  onlyInA: number;
  onlyInB: number;
}

function sessionStats(session: ScanSession): SessionCompareStats {
  const leads = session.results ?? [];
  let scoreTotal = 0;
  let enrichedCount = 0;
  let auditedCount = 0;
  let topRankCount = 0;

  for (const lead of leads) {
    scoreTotal += computeOpportunityScore(lead).total;
    if (lead.enrichmentStatus === 'done' || lead.enrichmentStatus === 'partial') enrichedCount++;
    if (lead.gbpAudit?.status === 'done') auditedCount++;
    if (typeof lead.mapsRank === 'number' && lead.mapsRank > 0 && lead.mapsRank <= 10) topRankCount++;
  }

  return {
    leadCount: leads.length,
    enrichedCount,
    auditedCount,
    avgOpportunityScore: leads.length ? Math.round(scoreTotal / leads.length) : 0,
    topRankCount,
  };
}

export function compareSessions(sessionA: ScanSession, sessionB: ScanSession): SessionComparison {
  const idsA = new Set(sessionA.results.map((l) => l.id));
  const idsB = new Set(sessionB.results.map((l) => l.id));
  const sharedLeadIds = [...idsA].filter((id) => idsB.has(id));

  return {
    sessionA,
    sessionB,
    statsA: sessionStats(sessionA),
    statsB: sessionStats(sessionB),
    sharedLeadIds,
    onlyInA: [...idsA].filter((id) => !idsB.has(id)).length,
    onlyInB: [...idsB].filter((id) => !idsA.has(id)).length,
  };
}
