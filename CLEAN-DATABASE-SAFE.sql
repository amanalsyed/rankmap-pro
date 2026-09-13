-- ============================================
-- SAFE CLEANUP - Delete Specific Test User
-- Use this if you only want to delete one user
-- ============================================

-- Replace 'test@example.com' with the email you want to delete
DO $$
DECLARE
  target_email TEXT := 'test@example.com'; -- ⚠️ CHANGE THIS
  target_user_id UUID;
BEGIN
  -- Find the user ID
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User not found: %', target_email;
  ELSE
    -- Delete related data
    DELETE FROM public.usage_counters WHERE user_id = target_user_id;
    DELETE FROM public.licenses WHERE user_id = target_user_id;
    DELETE FROM public.profiles WHERE id = target_user_id;
    DELETE FROM auth.users WHERE id = target_user_id;
    
    RAISE NOTICE 'Deleted user: % (ID: %)', target_email, target_user_id;
  END IF;
END $$;

-- Verify
SELECT 'Remaining users:' as status;
SELECT id, email, created_at FROM auth.users;
