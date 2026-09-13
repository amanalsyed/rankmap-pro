-- Fix: run this if the main migration failed on plan_limits_plan_check
-- Safe to re-run — idempotent where possible

UPDATE public.profiles SET plan = 'pro' WHERE plan = 'enterprise';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'pro'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS polar_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT;

-- Must delete enterprise BEFORE re-adding the check constraint
DELETE FROM public.plan_limits WHERE plan = 'enterprise';

ALTER TABLE public.plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;
ALTER TABLE public.plan_limits
  ADD CONSTRAINT plan_limits_plan_check
  CHECK (plan IN ('free', 'starter', 'pro'));

INSERT INTO public.plan_limits (plan, scans_per_month, deep_scans_per_month, audits_per_month)
VALUES
  ('free', 3, 5, 3),
  ('starter', 30, 150, 40),
  ('pro', 120, 750, 200)
ON CONFLICT (plan) DO UPDATE SET
  scans_per_month = EXCLUDED.scans_per_month,
  deep_scans_per_month = EXCLUDED.deep_scans_per_month,
  audits_per_month = EXCLUDED.audits_per_month;

CREATE TABLE IF NOT EXISTS public.plan_capabilities (
  plan TEXT PRIMARY KEY CHECK (plan IN ('free', 'starter', 'pro')),
  max_results_per_scan INTEGER NOT NULL,
  batch_max_cities INTEGER NOT NULL,
  enrichment_enabled BOOLEAN NOT NULL DEFAULT false,
  csv_export_enabled BOOLEAN NOT NULL DEFAULT false,
  csv_export_max_rows INTEGER NOT NULL DEFAULT 0,
  rank_check_max_pins INTEGER NOT NULL DEFAULT 1,
  white_label_enabled BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.plan_capabilities (
  plan,
  max_results_per_scan,
  batch_max_cities,
  enrichment_enabled,
  csv_export_enabled,
  csv_export_max_rows,
  rank_check_max_pins,
  white_label_enabled
)
VALUES
  ('free', 30, 0, false, false, 0, 1, false),
  ('starter', 150, 3, true, true, -1, 9, true),
  ('pro', 500, 15, true, true, -1, 20, true)
ON CONFLICT (plan) DO UPDATE SET
  max_results_per_scan = EXCLUDED.max_results_per_scan,
  batch_max_cities = EXCLUDED.batch_max_cities,
  enrichment_enabled = EXCLUDED.enrichment_enabled,
  csv_export_enabled = EXCLUDED.csv_export_enabled,
  csv_export_max_rows = EXCLUDED.csv_export_max_rows,
  rank_check_max_pins = EXCLUDED.rank_check_max_pins,
  white_label_enabled = EXCLUDED.white_label_enabled;

CREATE TABLE IF NOT EXISTS public.polar_product_plans (
  polar_product_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro'))
);

INSERT INTO public.polar_product_plans (polar_product_id, plan)
VALUES
  ('69ee1fda-97fc-4819-b11c-eea075c8deb5', 'starter'),
  ('608c63ee-2fbf-435d-950b-bf5436e1821d', 'starter'),
  ('677b0a23-aada-4113-9ffc-d833374ce4e4', 'pro'),
  ('c080f609-6f1f-4072-ae28-9cb8776f447c', 'pro')
ON CONFLICT (polar_product_id) DO UPDATE SET plan = EXCLUDED.plan;

ALTER TABLE public.polar_product_plans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_current_usage()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_caps public.plan_capabilities;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  SELECT * INTO v_caps FROM public.plan_capabilities WHERE plan = v_profile.plan;
  v_counter := public.get_or_create_usage_counter();

  RETURN json_build_object(
    'plan', v_profile.plan,
    'scans_used', v_counter.scans_used,
    'scans_limit', v_limits.scans_per_month,
    'deep_scans_used', v_counter.businesses_deep_scanned,
    'deep_scans_limit', v_limits.deep_scans_per_month,
    'audits_used', v_counter.audits_used,
    'audits_limit', v_limits.audits_per_month,
    'period_start', v_counter.period_start,
    'max_results_per_scan', v_caps.max_results_per_scan,
    'batch_max_cities', v_caps.batch_max_cities,
    'enrichment_enabled', v_caps.enrichment_enabled,
    'csv_export_enabled', v_caps.csv_export_enabled,
    'csv_export_max_rows', v_caps.csv_export_max_rows,
    'rank_check_max_pins', v_caps.rank_check_max_pins,
    'white_label_enabled', v_caps.white_label_enabled
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
