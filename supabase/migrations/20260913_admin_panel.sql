-- Admin panel: super-admin flag, account status, activity logs, quota enforcement

-- ── Profile admin fields ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'deleted')),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles (account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin ON public.profiles (is_super_admin) WHERE is_super_admin = true;

-- ── User activity events (extension + server) ──
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON public.activity_events (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON public.activity_events (event_type);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
-- No user policies — service role / admin API only

-- ── Admin action audit log ──
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ── Block suspended/deleted accounts in quota RPCs ──
CREATE OR REPLACE FUNCTION public.check_profile_account_status(p_profile public.profiles)
RETURNS JSON AS $$
BEGIN
  IF COALESCE(p_profile.account_status, 'active') = 'suspended' THEN
    RETURN json_build_object(
      'allowed', false,
      'message', 'Your account is suspended. Contact support at rankmappro@gmail.com'
    );
  END IF;
  IF COALESCE(p_profile.account_status, 'active') = 'deleted' THEN
    RETURN json_build_object(
      'allowed', false,
      'message', 'This account has been deleted.'
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Patch consume_scan_quota
CREATE OR REPLACE FUNCTION public.consume_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_status JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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

-- Patch consume_audit_quota
CREATE OR REPLACE FUNCTION public.consume_audit_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_status JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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
      RETURN json_build_object('allowed', false, 'message', 'Purchase a license to unlock more audits');
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

-- Patch consume_quick_scan_quota
CREATE OR REPLACE FUNCTION public.consume_quick_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_status JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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

-- Patch consume_deep_scan_quota
CREATE OR REPLACE FUNCTION public.consume_deep_scan_quota(count INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_new_total INTEGER;
  v_status JSON;
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

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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

-- Patch consume_enrichment_scan_quota
CREATE OR REPLACE FUNCTION public.consume_enrichment_scan_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_counter public.usage_counters;
  v_status JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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

-- Patch consume_csv_export_quota
CREATE OR REPLACE FUNCTION public.consume_csv_export_quota()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
  v_caps public.plan_capabilities;
  v_counter public.usage_counters;
  v_status JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  v_status := public.check_profile_account_status(v_profile);
  IF v_status IS NOT NULL THEN RETURN v_status; END IF;

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
