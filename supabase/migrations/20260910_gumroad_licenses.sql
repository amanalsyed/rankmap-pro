-- Migration: Add Gumroad license key system and remove Polar columns
-- Date: 2026-09-10

-- Step 1: Create licenses table
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  creem_order_id TEXT,
  creem_license_id TEXT UNIQUE,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'refunded')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_creem_order_id ON public.licenses(creem_order_id);
CREATE INDEX IF NOT EXISTS idx_licenses_creem_license_id ON public.licenses(creem_license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

-- Step 3: Remove Polar columns from profiles table
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS polar_customer_id,
DROP COLUMN IF EXISTS polar_subscription_id,
DROP COLUMN IF EXISTS subscription_status,
DROP COLUMN IF EXISTS subscription_renews_at;

-- Step 4: Add license key reference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS license_key TEXT REFERENCES public.licenses(license_key) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS license_activated_at TIMESTAMPTZ;

-- Step 5: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for licenses table
DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 7: Enable RLS on licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies
-- Users can read their own licenses
CREATE POLICY "Users can read own licenses" 
  ON public.licenses 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Service role can do everything (for webhook)
CREATE POLICY "Service role full access" 
  ON public.licenses 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Step 9: Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;

-- Step 10: Add comment
COMMENT ON TABLE public.licenses IS 'Creem.io license keys for lifetime access';
