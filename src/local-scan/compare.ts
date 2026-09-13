import type { LocalScanBusiness, LocalScanSession } from './types';

export interface LocalScanCompareStats {
  businessCount: number;
  avgRating: number | null;
  avgReviews: number | null;
  withWebsite: number;
  withoutWebsite: number;
  avgGbpScore: number | null;
  deepScraped: number;
  uniquePrimaryCategories: number;
  uniqueServices: number;
  uniqueAttributes: number;
}

export interface LocalScanComparison {
  sessionA: LocalScanSession;
  sessionB: LocalScanSession;
  statsA: LocalScanCompareStats;
  statsB: LocalScanCompareStats;
  sharedNames: string[];
  onlyInA: string[];
  onlyInB: string[];
  rankChanges: Array<{ name: string; rankA: number | null; rankB: number | null; delta: number | null }>;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function statsForSession(session: LocalScanSession): LocalScanCompareStats {
  const businesses = session.businesses;
  const ratings = businesses.map((b) => b.rating).filter((v): v is number => v != null);
  const reviews = businesses.map((b) => b.reviewCount).filter((v): v is number => v != null);
  const scores = businesses.map((b) => b.gbpScore).filter((v): v is number => v != null);

  return {
    businessCount: businesses.length,
    avgRating: avg(ratings),
    avgReviews: avg(reviews),
    withWebsite: businesses.filter((b) => b.hasWebsite).length,
    withoutWebsite: businesses.filter((b) => !b.hasWebsite).length,
    avgGbpScore: avg(scores),
    deepScraped: businesses.filter((b) => b.deepScraped).length,
    uniquePrimaryCategories: new Set(businesses.map((b) => b.primaryCategory).filter(Boolean)).size,
    uniqueServices: new Set(businesses.flatMap((b) => b.services)).size,
    uniqueAttributes: new Set(businesses.flatMap((b) => b.attributes)).size,
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function compareLocalScanSessions(
  sessionA: LocalScanSession,
  sessionB: LocalScanSession
): LocalScanComparison {
  const mapA = new Map<string, LocalScanBusiness>();
  const mapB = new Map<string, LocalScanBusiness>();

  for (const b of sessionA.businesses) mapA.set(normalizeName(b.name), b);
  for (const b of sessionB.businesses) mapB.set(normalizeName(b.name), b);

  const sharedNames: string[] = [];
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const rankChanges: LocalScanComparison['rankChanges'] = [];

  for (const [key, business] of mapA) {
    if (mapB.has(key)) {
      sharedNames.push(business.name);
      const other = mapB.get(key)!;
      rankChanges.push({
        name: business.name,
        rankA: business.rank,
        rankB: other.rank,
        delta: other.rank - business.rank,
      });
    } else {
      onlyInA.push(business.name);
    }
  }

  for (const [key, business] of mapB) {
    if (!mapA.has(key)) onlyInB.push(business.name);
  }

  rankChanges.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

  return {
    sessionA,
    sessionB,
    statsA: statsForSession(sessionA),
    statsB: statsForSession(sessionB),
    sharedNames,
    onlyInA,
    onlyInB,
    rankChanges,
  };
}
