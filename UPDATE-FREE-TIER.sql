-- ============================================
-- UPDATE FREE TIER LIMITS
-- Run this in Supabase SQL Editor
-- ============================================

-- Update monthly quotas
UPDATE public.plan_limits SET
  scans_per_month = 2,
  quick_scans_per_month = 3,
  deep_scans_per_month = 3,
  audits_per_month = 3,
  enrichment_scans_per_month = 1,
  csv_exports_per_month = 1
WHERE plan = 'free';

-- Update per-scan capabilities
UPDATE public.plan_capabilities SET
  max_results_per_scan = 100,
  batch_max_cities = 1,
  rank_check_max_pins = 1,
  enrichment_enabled = true,
  audit_enrichment_enabled = false,
  csv_export_enabled = true,
  csv_export_max_rows = -1,
  white_label_enabled = false
WHERE plan = 'free';

-- Verify the changes
SELECT 'Monthly Limits:' as info;
SELECT * FROM public.plan_limits WHERE plan = 'free';

SELECT 'Per-Scan Capabilities:' as info;
SELECT * FROM public.plan_capabilities WHERE plan = 'free';
