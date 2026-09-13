import type { Plan } from './types';



export interface PlanCapabilities {

  maxResultsPerScan: number;

  batchMaxCities: number;

  enrichmentEnabled: boolean;

  auditEnrichmentEnabled: boolean;

  csvExportEnabled: boolean;

  csvExportMaxRows: number;

  rankCheckMaxPins: number;

  whiteLabelEnabled: boolean;

}



export const PLAN_CAPABILITIES: Record<Plan, PlanCapabilities> = {

  free: {

    maxResultsPerScan: 50,

    batchMaxCities: 1,

    enrichmentEnabled: true,

    auditEnrichmentEnabled: false,

    csvExportEnabled: true,

    csvExportMaxRows: -1,

    rankCheckMaxPins: 1,

    whiteLabelEnabled: false,

  },

  pro: {

    maxResultsPerScan: 500,

    batchMaxCities: 15,

    enrichmentEnabled: true,

    auditEnrichmentEnabled: true,

    csvExportEnabled: true,

    csvExportMaxRows: -1,

    rankCheckMaxPins: 20,

    whiteLabelEnabled: true,

  },

  lifetime: {

    maxResultsPerScan: 999,

    batchMaxCities: 99,

    enrichmentEnabled: true,

    auditEnrichmentEnabled: true,

    csvExportEnabled: true,

    csvExportMaxRows: -1,

    rankCheckMaxPins: 99,

    whiteLabelEnabled: true,

  },

};



export interface UsageCapabilities extends PlanCapabilities {

  plan: Plan;

}



const CAPABILITY_KEYS = [

  'max_results_per_scan',

  'batch_max_cities',

  'enrichment_enabled',

  'audit_enrichment_enabled',

  'csv_export_enabled',

  'csv_export_max_rows',

  'rank_check_max_pins',

  'white_label_enabled',

] as const;



export function capabilitiesFromUsage(

  usage: Record<string, unknown> | null | undefined,

  plan: Plan

): PlanCapabilities {

  const defaults = PLAN_CAPABILITIES[plan];

  if (!usage) return defaults;



  return {

    maxResultsPerScan:

      typeof usage.max_results_per_scan === 'number'

        ? usage.max_results_per_scan

        : defaults.maxResultsPerScan,

    batchMaxCities:

      typeof usage.batch_max_cities === 'number' ? usage.batch_max_cities : defaults.batchMaxCities,

    enrichmentEnabled:

      typeof usage.enrichment_enabled === 'boolean'

        ? usage.enrichment_enabled

        : defaults.enrichmentEnabled,

    auditEnrichmentEnabled:

      typeof usage.audit_enrichment_enabled === 'boolean'

        ? usage.audit_enrichment_enabled

        : defaults.auditEnrichmentEnabled,

    csvExportEnabled:

      typeof usage.csv_export_enabled === 'boolean'

        ? usage.csv_export_enabled

        : defaults.csvExportEnabled,

    csvExportMaxRows:

      typeof usage.csv_export_max_rows === 'number'

        ? usage.csv_export_max_rows

        : defaults.csvExportMaxRows,

    rankCheckMaxPins:

      typeof usage.rank_check_max_pins === 'number'

        ? usage.rank_check_max_pins

        : defaults.rankCheckMaxPins,

    whiteLabelEnabled:

      typeof usage.white_label_enabled === 'boolean'

        ? usage.white_label_enabled

        : defaults.whiteLabelEnabled,

  };

}



export function planRank(plan: Plan): number {
  if (plan === 'lifetime') return 2;
  if (plan === 'pro') return 1;
  return 0;
}



export function upgradeMessage(feature: string): string {

  return `${feature} requires a paid plan. Open Settings → Account to upgrade.`;

}



export function hasCapabilityUsageFields(usage: Record<string, unknown> | null | undefined): boolean {

  if (!usage) return false;

  return CAPABILITY_KEYS.some((key) => key in usage);

}


