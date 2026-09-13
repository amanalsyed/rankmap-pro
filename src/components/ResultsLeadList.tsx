import LeadFiltersBar from './LeadFiltersBar';
import ResultsTable from './ResultsTable';
import type { LeadFilters, LeadSortKey } from '../utils/opportunity-score';
import type { BusinessLead } from '../types';
import type { Plan } from '../supabase/types';

interface ResultsLeadListProps {
  leads: BusinessLead[];
  processed: BusinessLead[];
  filters: LeadFilters;
  sortKey: LeadSortKey;
  totalCount: number;
  filteredCount: number;
  activeFilterCount: number;
  onFiltersChange: (filters: LeadFilters) => void;
  onSortChange: (sort: LeadSortKey) => void;
  onResetFilters: () => void;
  auditingId?: string | null;
  auditError?: string | null;
  plan?: Plan;
  onAuditGbp?: (leadId: string, openWhenDone?: boolean) => void;
  onRefreshAudit?: (leadId: string) => void;
  onViewAudit?: (leadId: string) => void;
}

export default function ResultsLeadList({
  leads,
  processed,
  filters,
  sortKey,
  totalCount,
  filteredCount,
  activeFilterCount,
  onFiltersChange,
  onSortChange,
  onResetFilters,
  auditingId,
  auditError,
  plan,
  onAuditGbp,
  onRefreshAudit,
  onViewAudit,
}: ResultsLeadListProps) {
  if (leads.length === 0) {
    return (
      <ResultsTable
        leads={[]}
        auditingId={auditingId}
        auditError={auditError}
        plan={plan}
        onAuditGbp={onAuditGbp}
        onRefreshAudit={onRefreshAudit}
        onViewAudit={onViewAudit}
      />
    );
  }

  return (
    <>
      <LeadFiltersBar
        filters={filters}
        sortKey={sortKey}
        totalCount={totalCount}
        filteredCount={filteredCount}
        activeFilterCount={activeFilterCount}
        onFiltersChange={onFiltersChange}
        onSortChange={onSortChange}
        onResetFilters={onResetFilters}
      />
      {filteredCount === 0 ? (
        <div className="empty-results">
          No leads match the current filters.{' '}
          <button type="button" className="btn-link filter-reset-inline" onClick={onResetFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ResultsTable
          leads={processed}
          auditingId={auditingId}
          auditError={auditError}
          plan={plan}
          onAuditGbp={onAuditGbp}
          onRefreshAudit={onRefreshAudit}
          onViewAudit={onViewAudit}
        />
      )}
    </>
  );
}
