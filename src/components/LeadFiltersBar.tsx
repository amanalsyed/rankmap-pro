import {
  DEFAULT_LEAD_FILTERS,
  type LeadFilters,
  type LeadSortKey,
} from '../utils/opportunity-score';

interface LeadFiltersBarProps {
  filters: LeadFilters;
  sortKey: LeadSortKey;
  totalCount: number;
  filteredCount: number;
  activeFilterCount: number;
  onFiltersChange: (filters: LeadFilters) => void;
  onSortChange: (sort: LeadSortKey) => void;
  onResetFilters: () => void;
}

export default function LeadFiltersBar({
  filters,
  sortKey,
  totalCount,
  filteredCount,
  activeFilterCount,
  onFiltersChange,
  onSortChange,
  onResetFilters,
}: LeadFiltersBarProps) {
  const toggle = (key: keyof Pick<LeadFilters, 'hasEmail' | 'hasOwner' | 'top10Rank'>) => {
    onFiltersChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className="lead-filters-bar">
      <div className="lead-filters-row">
        <label className="lead-filter-sort">
          <span>Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as LeadSortKey)}
            aria-label="Sort leads"
          >
            <option value="opportunity">Opportunity score</option>
            <option value="mapsRank">Maps rank (best first)</option>
            <option value="gbpScore">GBP score (weakest first)</option>
            <option value="reviews">Review count</option>
            <option value="name">Business name</option>
          </select>
        </label>

        <div className="lead-filter-chips" role="group" aria-label="Filter leads">
          <button
            type="button"
            className={`filter-chip ${filters.hasEmail ? 'active' : ''}`}
            onClick={() => toggle('hasEmail')}
          >
            Has email
          </button>
          <button
            type="button"
            className={`filter-chip ${filters.hasOwner ? 'active' : ''}`}
            onClick={() => toggle('hasOwner')}
          >
            Has owner
          </button>
          <button
            type="button"
            className={`filter-chip ${filters.top10Rank ? 'active' : ''}`}
            onClick={() => toggle('top10Rank')}
          >
            Top 10 rank
          </button>
          <label className="filter-chip filter-chip-select">
            <span>GBP below</span>
            <select
              value={filters.maxGbpScore ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                onFiltersChange({
                  ...filters,
                  maxGbpScore: raw === '' ? null : Number(raw),
                });
              }}
              aria-label="Maximum GBP audit score"
            >
              <option value="">Any</option>
              <option value="40">40</option>
              <option value="50">50</option>
              <option value="60">60</option>
              <option value="70">70</option>
            </select>
          </label>
        </div>

        {activeFilterCount > 0 && (
          <button type="button" className="btn-link filter-reset" onClick={onResetFilters}>
            Clear filters
          </button>
        )}
      </div>

      <p className="lead-filters-meta">
        Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> leads
        {sortKey === 'opportunity' ? ' · sorted by best opportunity first' : null}
      </p>
    </div>
  );
}

export { DEFAULT_LEAD_FILTERS };
