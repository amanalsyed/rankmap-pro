-- ============================================================================
-- RankMap Pro - Supabase Schema
-- ============================================================================
-- Run this in your Supabase SQL Editor to set up the database.
-- 
-- IMPORTANT: This creates tables with Row Level Security (RLS) enabled.
-- Users can only read their own data. Plan/limit fields are read-only to users
-- and can only be modified by server-side code (service_role or Edge Functions).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PROFILES TABLE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users cannot update plan/plan_expires_at (only server can)
CREATE POLICY "Users can update own email only"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan)
  VALUES (NEW.id, NEW.email, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- USAGE COUNTERS TABLE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  scans_used INTEGER NOT NULL DEFAULT 0,
  businesses_deep_scanned INTEGER NOT NULL DEFAULT 0,
  audits_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_start)
);

-- Enable RLS
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own usage"
  ON public.usage_counters FOR SELECT
  USING (auth.uid() = user_id);

-- Users cannot directly update usage (only via RPC functions)
-- No UPDATE policy = users cannot update

-- ────────────────────────────────────────────────────────────────────────────
-- PLAN LIMITS (reference table, no RLS needed)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan TEXT PRIMARY KEY CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  scans_per_month INTEGER NOT NULL,
  deep_scans_per_month INTEGER NOT NULL,
  audits_per_month INTEGER NOT NULL
);

-- Insert default limits (-1 = unlimited)
INSERT INTO public.plan_limits (plan, scans_per_month, deep_scans_per_month, audits_per_month)
VALUES 
  ('free', 10, 50, 20),
  ('starter', 50, 500, 100),
  ('pro', 200, 2000, 500),
  ('enterprise', -1, -1, -1)
ON CONFLICT (plan) DO UPDATE SET
  scans_per_month = EXCLUDED.scans_per_month,
  deep_scans_per_month = EXCLUDED.deep_scans_per_month,
  audits_per_month = EXCLUDED.audits_per_month;

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: Get or create current month's usage counter
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_usage_counter()
RETURNS public.usage_counters AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_period DATE := DATE_TRUNC('month', NOW())::DATE;
  v_counter public.usage_counters;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Try to get existing counter
  SELECT * INTO v_counter
  FROM public.usage_counters
  WHERE user_id = v_user_id AND period_start = v_period;

  -- Create if not exists
  IF NOT FOUND THEN
    INSERT INTO public.usage_counters (user_id, period_start)
    VALUES (v_user_id, v_period)
    RETURNING * INTO v_counter;
  END IF;

  RETURN v_counter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- CONSUME SCAN QUOTA (atomic check + increment)
-- ────────────────────────────────────────────────────────────────────────────

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

  -- Get profile and limits
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Profile not found');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_profile.plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'message', 'Invalid plan');
  END IF;

  -- Check plan expiry
  IF v_profile.plan_expires_at IS NOT NULL AND v_profile.plan_expires_at < NOW() THEN
    RETURN json_build_object('allowed', false, 'message', 'Plan expired');
  END IF;

  -- Get/create usage counter
  v_counter := public.get_or_create_usage_counter();

  -- Check limit (-1 = unlimited)
  IF v_limits.scans_per_month >= 0 AND v_counter.scans_used >= v_limits.scans_per_month THEN
    RETURN json_build_object(
      'allowed', false, 
      'message', format('Scan limit reached (%s/%s). Upgrade your plan for more scans.', 
                        v_counter.scans_used, v_limits.scans_per_month)
    );
  END IF;

  -- Increment usage
  UPDATE public.usage_counters
  SET scans_used = scans_used + 1, updated_at = NOW()
  WHERE id = v_counter.id;

  RETURN json_build_object('allowed', true, 'message', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- CONSUME DEEP SCAN QUOTA
-- ────────────────────────────────────────────────────────────────────────────

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

  IF v_profile.plan_expires_at IS NOT NULL AND v_profile.plan_expires_at < NOW() THEN
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

-- ────────────────────────────────────────────────────────────────────────────
-- CONSUME AUDIT QUOTA
-- ────────────────────────────────────────────────────────────────────────────

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

  IF v_profile.plan_expires_at IS NOT NULL AND v_profile.plan_expires_at < NOW() THEN
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

-- ────────────────────────────────────────────────────────────────────────────
-- GET CURRENT USAGE (for UI display)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_current_usage()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles;
  v_limits public.plan_limits;
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
  v_counter := public.get_or_create_usage_counter();

  RETURN json_build_object(
    'plan', v_profile.plan,
    'scans_used', v_counter.scans_used,
    'scans_limit', v_limits.scans_per_month,
    'deep_scans_used', v_counter.businesses_deep_scanned,
    'deep_scans_limit', v_limits.deep_scans_per_month,
    'audits_used', v_counter.audits_used,
    'audits_limit', v_limits.audits_per_month,
    'period_start', v_counter.period_start
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS usage_counters_updated_at ON public.usage_counters;
CREATE TRIGGER usage_counters_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
