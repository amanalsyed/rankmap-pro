-- ============================================
-- CLEAN DATABASE - DELETE ALL USERS & DATA
-- ⚠️ WARNING: This deletes ALL user data!
-- ============================================

-- Step 1: Delete all usage counters
DELETE FROM public.usage_counters;
SELECT 'Deleted usage counters' as status;

-- Step 2: Delete all licenses
DELETE FROM public.licenses;
SELECT 'Deleted licenses' as status;

-- Step 3: Delete all profiles
DELETE FROM public.profiles;
SELECT 'Deleted profiles' as status;

-- Step 4: Delete all scan history (if you have these tables)
-- Uncomment if you want to clean history too:
-- DELETE FROM public.scan_sessions;
-- DELETE FROM public.gbp_audits;
-- DELETE FROM public.local_scans;

-- Step 5: Delete all auth users
-- This requires admin access to auth.users table
-- If you get permission errors, use the Supabase dashboard instead
DELETE FROM auth.users;
SELECT 'Deleted auth users' as status;

-- Verify everything is clean
SELECT 'Verification:' as check;
SELECT COUNT(*) as usage_counters_count FROM public.usage_counters;
SELECT COUNT(*) as licenses_count FROM public.licenses;
SELECT COUNT(*) as profiles_count FROM public.profiles;
SELECT COUNT(*) as auth_users_count FROM auth.users;

-- Done!
SELECT '✅ Database cleaned! Ready for fresh testing.' as result;
