-- New pricing tiers + Lifetime plan (unlimited everything)

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'lifetime'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifetime_purchased_at TIMESTAMPTZ;

ALTER TABLE public.plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;
ALTER TABLE public.plan_limits
  ADD CONSTRAINT plan_limits_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'lifetime'));

ALTER TABLE public.plan_capabilities DROP CONSTRAINT IF EXISTS plan_capabilities_plan_check;
ALTER TABLE public.plan_capabilities
  DROP CONSTRAINT IF EXISTS plan_capabilities_plan_check;
ALTER TABLE public.plan_capabilities
  ADD CONSTRAINT plan_capabilities_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'lifetime'));

ALTER TABLE public.polar_product_plans DROP CONSTRAINT IF EXISTS polar_product_plans_plan_check;
ALTER TABLE public.polar_product_plans
  ADD CONSTRAINT polar_product_plans_plan_check
  CHECK (plan IN ('starter', 'pro', 'lifetime'));

INSERT INTO public.plan_limits (
  plan,
  scans_per_month,
  deep_scans_per_month,
  audits_per_month,
  quick_scans_per_month,
  enrichment_scans_per_month,
  csv_exports_per_month
)
VALUES ('lifetime', -1, -1, -1, -1, -1, -1)
ON CONFLICT (plan) DO UPDATE SET
  scans_per_month = EXCLUDED.scans_per_month,
  deep_scans_per_month = EXCLUDED.deep_scans_per_month,
  audits_per_month = EXCLUDED.audits_per_month,
  quick_scans_per_month = EXCLUDED.quick_scans_per_month,
  enrichment_scans_per_month = EXCLUDED.enrichment_scans_per_month,
  csv_exports_per_month = EXCLUDED.csv_exports_per_month;

INSERT INTO public.plan_capabilities (
  plan,
  max_results_per_scan,
  batch_max_cities,
  enrichment_enabled,
  audit_enrichment_enabled,
  csv_export_enabled,
  csv_export_max_rows,
  rank_check_max_pins,
  white_label_enabled
)
VALUES ('lifetime', 999, 99, true, true, true, -1, 99, true)
ON CONFLICT (plan) DO UPDATE SET
  max_results_per_scan = EXCLUDED.max_results_per_scan,
  batch_max_cities = EXCLUDED.batch_max_cities,
  enrichment_enabled = EXCLUDED.enrichment_enabled,
  audit_enrichment_enabled = EXCLUDED.audit_enrichment_enabled,
  csv_export_enabled = EXCLUDED.csv_export_enabled,
  csv_export_max_rows = EXCLUDED.csv_export_max_rows,
  rank_check_max_pins = EXCLUDED.rank_check_max_pins,
  white_label_enabled = EXCLUDED.white_label_enabled;

-- Lifetime purchases never expire; skip expiry checks for lifetime plan
CREATE OR REPLACE FUNCTION public.consume_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();

  IF v_limits.scans_per_month >= 0 AND v_counter.scans_used >= v_limits.scans_per_month THEN
    RETURN json_build_object(
      'allowed', false,
      'message', format('Scan limit reached (%s/%s). Upgrade your plan for more scans.',
                        v_counter.scans_used, v_limits.scans_per_month)
    );
  END IF;

  UPDATE public.usage_counters
  SET scans_used = scans_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_deep_scan_quota(count INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_new_total INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  IF count <= 0 THEN
    RETURN json_build_object('allowed', true, 'message', 'ok');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();
  v_new_total := v_counter.businesses_deep_scanned + count;

  IF v_limits.deep_scans_per_month >= 0 AND v_new_total > v_limits.deep_scans_per_month THEN
    RETURN json_build_object(
      'allowed', false,
      'message', format('Deep scan limit would be exceeded (%s + %s > %s). Upgrade your plan.',
                        v_counter.businesses_deep_scanned, count, v_limits.deep_scans_per_month)
    );
  END IF;

  UPDATE public.usage_counters
  SET businesses_deep_scanned = v_new_total, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_audit_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();

  IF v_limits.audits_per_month >= 0 AND v_counter.audits_used >= v_limits.audits_per_month THEN
    IF v_profile.plan = 'free' THEN
      RETURN json_build_object(
        'allowed', false,
        'message', 'Purchase a license to unlock more audits'
      );
    ELSE
      RETURN json_build_object(
        'allowed', false,
        'message', format('Audit limit reached (%s/%s). Upgrade your plan.',
                          v_counter.audits_used, v_limits.audits_per_month)
      );
    END IF;
  END IF;

  UPDATE public.usage_counters
  SET audits_used = audits_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_enrichment_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();

  IF v_limits.enrichment_scans_per_month < 0 THEN
    RETURN json_build_object('allowed', true, 'message', 'ok');
  END IF;

  IF v_counter.enrichment_scans_used >= v_limits.enrichment_scans_per_month THEN
    RETURN json_build_object(
      'allowed', false,
      'message', format(
        'Enrichment scan limit reached (%s/%s this month). Upgrade in Settings → Account.',
        v_counter.enrichment_scans_used, v_limits.enrichment_scans_per_month
      )
    );
  END IF;

  UPDATE public.usage_counters
  SET enrichment_scans_used = enrichment_scans_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_csv_export_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_caps public.plan_capabilities;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  SELECT * INTO v_caps FROM public.plan_capabilities WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF NOT v_caps.csv_export_enabled THEN
    RETURN json_build_object(
      'allowed', false,
      'message', 'CSV export requires a paid plan. Open Settings → Account to upgrade.'
    );
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();

  IF v_limits.csv_exports_per_month < 0 THEN
    RETURN json_build_object('allowed', true, 'message', 'ok');
  END IF;

  IF v_counter.csv_exports_used >= v_limits.csv_exports_per_month THEN
    RETURN json_build_object(
      'allowed', false,
      'message', format(
        'CSV export limit reached (%s/%s this month). Upgrade in Settings → Account for unlimited exports.',
        v_counter.csv_exports_used, v_limits.csv_exports_per_month
      )
    );
  END IF;

  UPDATE public.usage_counters
  SET csv_exports_used = csv_exports_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_quick_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  IF v_profile.plan <> 'lifetime'
     AND v_profile.plan_expires_at IS NOT NULL
     AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  v_counter := public.get_or_create_usage_counter();

  IF v_limits.quick_scans_per_month >= 0
     AND v_counter.quick_scans_used >= v_limits.quick_scans_per_month THEN
    RETURN json_build_object(
      'allowed', false,
      'message', format(
        'Quick scan limit reached (%s/%s). Upgrade in Settings → Account for unlimited quick scans.',
        v_counter.quick_scans_used, v_limits.quick_scans_per_month
      )
    );
  END IF;

  UPDATE public.usage_counters
  SET quick_scans_used = quick_scans_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
