import { useMemo, useState } from 'react';
import type { CategoryFrequency } from '../aggregate';
import { analyzeCategoryPack, copyCategoryList } from '../category-analytics';
import type { LocalScanBusiness } from '../types';
import { CategoryDistributionChart, CategoryRankChart } from './CategoryCharts';

function CategoryStatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="local-scan-category-stat">
      <div className="local-scan-category-stat-value">{value}</div>
      <div className="local-scan-category-stat-label">{label}</div>
    </div>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn-secondary local-scan-category-copy-btn"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function CategoryList({
  title,
  items,
  totalBusinesses,
  copyText,
}: {
  title: string;
  items: CategoryFrequency[];
  totalBusinesses: number;
  copyText: string;
}) {
  return (
    <section className="local-scan-category-panel">
      <div className="local-scan-category-panel-header">
        <h3 className="local-scan-subheading">{title}</h3>
        <CopyButton label="Copy all" text={copyText} />
      </div>
      {items.length === 0 ? (
        <p className="local-scan-meta">No categories found for this scan.</p>
      ) : (
        <div className="local-scan-category-list">
          {items.map((item) => (
            <div key={item.name} className="local-scan-category-row">
              <div className="local-scan-category-row-top">
                <div className="local-scan-category-name">{item.name}</div>
                <span className="local-scan-category-count">{item.count}</span>
              </div>
              <div className="local-scan-category-track">
                <div
                  className="local-scan-category-fill"
                  style={{ width: `${Math.max(item.share, 4)}%` }}
                />
              </div>
              <div className="local-scan-category-meta">
                <span>{item.share.toFixed(1)}%</span>
                <span>
                  {item.count}/{totalBusinesses}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CategoriesTab({ businesses }: { businesses: LocalScanBusiness[] }) {
  const analytics = useMemo(() => analyzeCategoryPack(businesses), [businesses]);
  const allCopy = copyCategoryList(analytics.allCategories);
  const primaryCopy = copyCategoryList(analytics.primaryCategories);

  return (
    <>
      <div className="local-scan-category-stats">
        <CategoryStatCard value={analytics.summary.totalBusinesses} label="Total Businesses" />
        <CategoryStatCard value={analytics.summary.uniqueCategories} label="Unique Categories" />
        <CategoryStatCard
          value={analytics.summary.uniquePrimaryCategories}
          label="Unique Primary Categories"
        />
        <CategoryStatCard value={analytics.summary.avgCategories} label="Avg Categories" />
        <CategoryStatCard value={analytics.summary.maxCategories} label="Max Categories" />
        <CategoryStatCard value={analytics.summary.minCategories} label="Min Categories" />
      </div>

      <div className="local-scan-category-layout">
        <div className="local-scan-category-charts-col">
          <CategoryRankChart data={analytics.rankPoints} />
          <CategoryDistributionChart data={analytics.countDistribution} />
        </div>

        <div className="local-scan-category-lists-col">
          <CategoryList
            title="All Categories"
            items={analytics.allCategories}
            totalBusinesses={analytics.summary.totalBusinesses}
            copyText={allCopy}
          />
          <CategoryList
            title="Primary Categories"
            items={analytics.primaryCategories}
            totalBusinesses={analytics.summary.totalBusinesses}
            copyText={primaryCopy}
          />
        </div>
      </div>
    </>
  );
}
