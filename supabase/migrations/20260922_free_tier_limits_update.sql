-- Update free tier limits (lead scans, audits, deep/quick local scans, results per scan)

UPDATE public.plan_limits SET
  scans_per_month = 2,
  audits_per_month = 3,
  deep_scans_per_month = 3,
  quick_scans_per_month = 3
WHERE plan = 'free';

UPDATE public.plan_capabilities SET
  max_results_per_scan = 100
WHERE plan = 'free';
