-- Migration: Creem.io license key system (Fixed)
-- Date: 2026-09-10

-- Step 1: Create licenses table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'refunded')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Step 2: Add Creem-specific columns if they don't exist
DO $$ 
BEGIN
  -- Add creem_order_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'creem_order_id'
  ) THEN
    ALTER TABLE public.licenses ADD COLUMN creem_order_id TEXT;
  END IF;

  -- Add creem_license_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'creem_license_id'
  ) THEN
    ALTER TABLE public.licenses ADD COLUMN creem_license_id TEXT UNIQUE;
  END IF;
END $$;

-- Step 3: Remove any old Gumroad-specific columns
DO $$
BEGIN
  -- Drop gumroad_sale_id if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'gumroad_sale_id'
  ) THEN
    ALTER TABLE public.licenses DROP COLUMN gumroad_sale_id;
  END IF;
END $$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_creem_order_id ON public.licenses(creem_order_id);
CREATE INDEX IF NOT EXISTS idx_licenses_creem_license_id ON public.licenses(creem_license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

-- Step 5: Remove Polar columns from profiles table
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS polar_customer_id,
DROP COLUMN IF EXISTS polar_subscription_id,
DROP COLUMN IF EXISTS subscription_status,
DROP COLUMN IF EXISTS subscription_renews_at;

-- Step 6: Add license key reference to profiles
DO $$
BEGIN
  -- Add license_key column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'license_key'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN license_key TEXT;
  END IF;

  -- Add license_activated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'license_activated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN license_activated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Step 7: Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'profiles' 
    AND constraint_name = 'profiles_license_key_fkey'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT profiles_license_key_fkey 
    FOREIGN KEY (license_key) REFERENCES public.licenses(license_key) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 8: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger for licenses table
DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 10: Enable RLS on licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Step 11: Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can read own licenses" ON public.licenses;
DROP POLICY IF EXISTS "Service role full access" ON public.licenses;

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

-- Step 12: Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;

-- Step 13: Add comment
COMMENT ON TABLE public.licenses IS 'Creem.io license keys for lifetime access';

-- Done!
SELECT 'Migration completed successfully!' as status;
