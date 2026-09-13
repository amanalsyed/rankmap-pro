-- ============================================
-- SIMPLE FIX: Allow Anonymous Users
-- ============================================

-- Step 1: Allow email to be NULL
ALTER TABLE public.profiles 
  ALTER COLUMN email DROP NOT NULL;

-- Step 2: Update trigger to handle anonymous users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan, license_key)
  VALUES (
    NEW.id, 
    NEW.email,
    'free',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Drop old email constraint if it exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;

-- Step 4: Create new constraint that allows multiple NULLs
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx 
  ON public.profiles (email) 
  WHERE email IS NOT NULL;

-- Verify
SELECT '✅ Fixed! Anonymous users are now supported.' as status;

SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('email', 'license_key', 'plan')
ORDER BY column_name;
