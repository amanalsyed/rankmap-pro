-- Update free tier limits to new restrictive values
-- Run date: September 12, 2026

-- Update monthly quotas in plan_limits table
UPDATE public.plan_limits SET
  scans_per_month = 1,            -- Was 3
  quick_scans_per_month = 2,      -- Was 10
  deep_scans_per_month = 1,       -- Was 5
  audits_per_month = 2,           -- Was 3
  enrichment_scans_per_month = 1, -- Unchanged
  csv_exports_per_month = 1       -- Unchanged
WHERE plan = 'free';

-- Update per-scan capabilities in plan_capabilities table
UPDATE public.plan_capabilities SET
  max_results_per_scan = 50,      -- Unchanged
  batch_max_cities = 1,           -- Was 0 (now single city only, no batch)
  enrichment_enabled = true,      -- Unchanged
  audit_enrichment_enabled = false, -- Unchanged
  csv_export_enabled = true,      -- Unchanged
  csv_export_max_rows = -1,       -- Unchanged (unlimited rows per export)
  rank_check_max_pins = 1,        -- Was 3
  white_label_enabled = false     -- Unchanged
WHERE plan = 'free';

-- Verify the changes
SELECT 
  'free' as plan,
  scans_per_month,
  quick_scans_per_month,
  deep_scans_per_month,
  audits_per_month,
  enrichment_scans_per_month,
  csv_exports_per_month
FROM public.plan_limits 
WHERE plan = 'free';

SELECT 
  'free' as plan,
  max_results_per_scan,
  batch_max_cities,
  rank_check_max_pins,
  white_label_enabled
FROM public.plan_capabilities 
WHERE plan = 'free';
