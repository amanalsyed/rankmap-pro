-- ============================================
-- FIX: Handle Anonymous Users in Trigger
-- ============================================

-- Update the trigger function to handle anonymous users (email = null)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert profile for new user (works for both regular and anonymous users)
  INSERT INTO public.profiles (id, email, plan, license_key)
  VALUES (
    NEW.id, 
    NEW.email,  -- Can be null for anonymous users
    'free',     -- Default to free plan
    NULL        -- No license key initially
  )
  ON CONFLICT (id) DO NOTHING;  -- Skip if profile already exists
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the trigger exists
SELECT 
  'Trigger updated successfully!' as status,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Test: Check if profiles table allows null emails
SELECT 
  'Checking profiles table constraints...' as status,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('email', 'license_key', 'plan');
