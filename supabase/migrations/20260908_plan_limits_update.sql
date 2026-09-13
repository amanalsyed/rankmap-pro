-- Updated plan limits, capabilities, and free-tier enrichment/CSV quotas

ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS enrichment_scans_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS csv_exports_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS enrichment_scans_per_month INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS csv_exports_per_month INTEGER NOT NULL DEFAULT -1;

UPDATE public.plan_limits SET
  scans_per_month = 3,
  deep_scans_per_month = 5,
  audits_per_month = 3,
  quick_scans_per_month = 10,
  enrichment_scans_per_month = 1,
  csv_exports_per_month = 1
WHERE plan = 'free';

UPDATE public.plan_limits SET
  scans_per_month = 60,
  deep_scans_per_month = 200,
  audits_per_month = 80,
  quick_scans_per_month = -1,
  enrichment_scans_per_month = -1,
  csv_exports_per_month = -1
WHERE plan = 'starter';

UPDATE public.plan_limits SET
  scans_per_month = 200,
  deep_scans_per_month = 1000,
  audits_per_month = 300,
  quick_scans_per_month = -1,
  enrichment_scans_per_month = -1,
  csv_exports_per_month = -1
WHERE plan = 'pro';

ALTER TABLE public.plan_capabilities
  ADD COLUMN IF NOT EXISTS audit_enrichment_enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE public.plan_capabilities SET
  max_results_per_scan = 50,
  batch_max_cities = 0,
  enrichment_enabled = true,
  audit_enrichment_enabled = false,
  csv_export_enabled = true,
  csv_export_max_rows = -1,
  rank_check_max_pins = 3,
  white_label_enabled = false
WHERE plan = 'free';

UPDATE public.plan_capabilities SET
  max_results_per_scan = 150,
  batch_max_cities = 5,
  enrichment_enabled = true,
  audit_enrichment_enabled = true,
  csv_export_enabled = true,
  csv_export_max_rows = -1,
  rank_check_max_pins = 9,
  white_label_enabled = true
WHERE plan = 'starter';

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

-- Reserve one lead scan per month that may run contact enrichment (all leads in that scan)
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

  IF v_profile.plan_expires_at IS NOT NULL AND v_profile.plan_expires_at < NOW() THEN
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
        'Enrichment scan limit reached (%s/%s this month). Free plan includes enrichment on 1 of your 3 monthly lead scans. Upgrade in Settings → Account.',
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

  IF v_profile.plan_expires_at IS NOT NULL AND v_profile.plan_expires_at < NOW() THEN
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
    'quick_scans_used', v_counter.quick_scans_used,
    'quick_scans_limit', v_limits.quick_scans_per_month,
    'deep_scans_used', v_counter.businesses_deep_scanned,
    'deep_scans_limit', v_limits.deep_scans_per_month,
    'audits_used', v_counter.audits_used,
    'audits_limit', v_limits.audits_per_month,
    'enrichment_scans_used', v_counter.enrichment_scans_used,
    'enrichment_scans_limit', v_limits.enrichment_scans_per_month,
    'csv_exports_used', v_counter.csv_exports_used,
    'csv_exports_limit', v_limits.csv_exports_per_month,
    'period_start', v_counter.period_start,
    'max_results_per_scan', v_caps.max_results_per_scan,
    'batch_max_cities', v_caps.batch_max_cities,
    'enrichment_enabled', v_caps.enrichment_enabled,
    'audit_enrichment_enabled', v_caps.audit_enrichment_enabled,
    'csv_export_enabled', v_caps.csv_export_enabled,
    'csv_export_max_rows', v_caps.csv_export_max_rows,
    'rank_check_max_pins', v_caps.rank_check_max_pins,
    'white_label_enabled', v_caps.white_label_enabled
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
