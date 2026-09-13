import { useMemo, useState } from 'react';
import type { BusinessLead } from '../types';
import {
  activeFilterCount,
  DEFAULT_LEAD_FILTERS,
  processLeads,
  type LeadFilters,
  type LeadSortKey,
} from '../utils/opportunity-score';

export function useProcessedLeads(leads: BusinessLead[]) {
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS);
  const [sortKey, setSortKey] = useState<LeadSortKey>('opportunity');

  const processed = useMemo(
    () => processLeads(leads, filters, sortKey),
    [leads, filters, sortKey]
  );

  const resetFilters = () => setFilters(DEFAULT_LEAD_FILTERS);

  return {
    processed,
    filters,
    setFilters,
    sortKey,
    setSortKey,
    resetFilters,
    totalCount: leads.length,
    filteredCount: processed.length,
    activeFilterCount: activeFilterCount(filters),
  };
}
