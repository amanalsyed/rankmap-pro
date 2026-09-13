-- ============================================
-- COMPLETE FIX: Anonymous User Support
-- ============================================

-- Step 1: Ensure email column allows NULL
ALTER TABLE public.profiles 
  ALTER COLUMN email DROP NOT NULL;

-- Step 2: Ensure license_key column allows NULL  
ALTER TABLE public.profiles 
  ALTER COLUMN license_key DROP NOT NULL;

-- Step 3: Update trigger to handle anonymous users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert profile for new user (regular or anonymous)
  INSERT INTO public.profiles (id, email, plan, license_key)
  VALUES (
    NEW.id, 
    NEW.email,  -- Can be null for anonymous users
    'free',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Drop unique constraint on email if it doesn't allow multiple nulls
-- (PostgreSQL handles this correctly by default, but just in case)
DO $$ 
BEGIN
  -- Drop any unique constraint on email that isn't partial
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%email%' 
    AND contype = 'u'
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
    
    -- Create partial unique constraint (only for non-null emails)
    ALTER TABLE public.profiles 
      ADD CONSTRAINT profiles_email_key 
      UNIQUE (email) 
      WHERE email IS NOT NULL;
      
    RAISE NOTICE 'Updated email constraint to allow multiple null values';
  END IF;
END $$;

-- Step 5: Update RLS policies to allow anonymous users
-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile  
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Step 6: Verify everything
SELECT '✅ Anonymous user support enabled!' as status;

SELECT 'Checking profiles constraints:' as check;
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('id', 'email', 'license_key', 'plan')
ORDER BY ordinal_position;

SELECT 'Checking RLS policies:' as check;
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;
