import type { LocalScanBusiness } from './types';
import {
  aggregateCategoryFrequency,
  aggregatePrimaryCategoryFrequency,
  type CategoryFrequency,
} from './aggregate';

export interface CategoryPackSummary {
  totalBusinesses: number;
  uniqueCategories: number;
  uniquePrimaryCategories: number;
  avgCategories: number;
  maxCategories: number;
  minCategories: number;
}

export interface CategoryRankPoint {
  rank: number;
  name: string;
  placeId: string;
  categoryCount: number;
}

export interface CategoryCountBucket {
  categoryCount: number;
  label: string;
  businesses: number;
}

export interface CategoryPackAnalytics {
  summary: CategoryPackSummary;
  rankPoints: CategoryRankPoint[];
  countDistribution: CategoryCountBucket[];
  allCategories: CategoryFrequency[];
  primaryCategories: CategoryFrequency[];
}

export function uniqueCategoriesForBusiness(business: LocalScanBusiness): string[] {
  const categories = [business.primaryCategory, ...business.secondaryCategories]
    .map((c) => c.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  return categories.filter((cat) => {
    const key = cat.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function categoryCountForBusiness(business: LocalScanBusiness): number {
  return uniqueCategoriesForBusiness(business).length;
}

export function analyzeCategoryPack(businesses: LocalScanBusiness[]): CategoryPackAnalytics {
  const counts = businesses.map(categoryCountForBusiness);
  const total = businesses.length || 1;
  const allCategories = aggregateCategoryFrequency(businesses);
  const primaryCategories = aggregatePrimaryCategoryFrequency(businesses);

  const avgCategories =
    counts.length > 0
      ? Math.round((counts.reduce((sum, value) => sum + value, 0) / counts.length) * 10) / 10
      : 0;

  const maxCategories = counts.length ? Math.max(...counts) : 0;
  const minCategories = counts.length ? Math.min(...counts) : 0;

  const rankPoints = businesses
    .map((business) => ({
      rank: business.rank,
      name: business.name,
      placeId: business.placeId,
      categoryCount: categoryCountForBusiness(business),
    }))
    .sort((a, b) => a.rank - b.rank);

  const distributionMap = new Map<number, number>();
  for (const count of counts) {
    distributionMap.set(count, (distributionMap.get(count) ?? 0) + 1);
  }

  const maxBucket = Math.max(maxCategories, 1);
  const countDistribution: CategoryCountBucket[] = [];
  for (let i = 1; i <= maxBucket; i++) {
    countDistribution.push({
      categoryCount: i,
      label: String(i),
      businesses: distributionMap.get(i) ?? 0,
    });
  }

  return {
    summary: {
      totalBusinesses: total,
      uniqueCategories: allCategories.length,
      uniquePrimaryCategories: primaryCategories.length,
      avgCategories,
      maxCategories,
      minCategories,
    },
    rankPoints,
    countDistribution,
    allCategories,
    primaryCategories,
  };
}

export function copyCategoryList(items: CategoryFrequency[]): string {
  return items.map((item) => `${item.name} — ${item.count} (${item.share}%)`).join('\n');
}
