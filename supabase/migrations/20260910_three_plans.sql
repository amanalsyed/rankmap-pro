-- Three plans only: free, pro, lifetime. Remove starter tier.

UPDATE public.profiles SET plan = 'pro' WHERE plan = 'starter';

DELETE FROM public.plan_limits WHERE plan = 'starter';
DELETE FROM public.plan_capabilities WHERE plan = 'starter';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'lifetime'));

ALTER TABLE public.plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;
ALTER TABLE public.plan_limits
  ADD CONSTRAINT plan_limits_plan_check
  CHECK (plan IN ('free', 'pro', 'lifetime'));

ALTER TABLE public.plan_capabilities DROP CONSTRAINT IF EXISTS plan_capabilities_plan_check;
ALTER TABLE public.plan_capabilities
  ADD CONSTRAINT plan_capabilities_plan_check
  CHECK (plan IN ('free', 'pro', 'lifetime'));

ALTER TABLE public.polar_product_plans DROP CONSTRAINT IF EXISTS polar_product_plans_plan_check;

-- Must update rows before adding the tighter check constraint
UPDATE public.polar_product_plans SET plan = 'pro' WHERE plan = 'starter';

ALTER TABLE public.polar_product_plans
  ADD CONSTRAINT polar_product_plans_plan_check
  CHECK (plan IN ('pro', 'lifetime'));

-- Free tier limits
UPDATE public.plan_limits SET
  scans_per_month = 3,
  deep_scans_per_month = 5,
  audits_per_month = 5,
  quick_scans_per_month = 10,
  enrichment_scans_per_month = 1,
  csv_exports_per_month = 1
WHERE plan = 'free';

UPDATE public.plan_capabilities SET
  max_results_per_scan = 50,
  batch_max_cities = 2,
  enrichment_enabled = true,
  audit_enrichment_enabled = false,
  csv_export_enabled = true,
  csv_export_max_rows = -1,
  rank_check_max_pins = 3,
  white_label_enabled = false
WHERE plan = 'free';

-- Pro unchanged (same as prior pro tier)
UPDATE public.plan_limits SET
  scans_per_month = 200,
  deep_scans_per_month = 1000,
  audits_per_month = 300,
  quick_scans_per_month = -1,
  enrichment_scans_per_month = -1,
  csv_exports_per_month = -1
WHERE plan = 'pro';

UPDATE public.plan_capabilities SET
  max_results_per_scan = 500,
  batch_max_cities = 15,
  enrichment_enabled = true,
  audit_enrichment_enabled = true,
  csv_export_enabled = true,
  csv_export_max_rows = -1,
  rank_check_max_pins = 20,
  white_label_enabled = true
WHERE plan = 'pro';
