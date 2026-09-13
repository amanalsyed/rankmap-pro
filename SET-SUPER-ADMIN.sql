-- Run once in Supabase SQL Editor to grant yourself super-admin access.
-- Replace the email with your owner account email.

UPDATE public.profiles
SET is_super_admin = true
WHERE email = 'amanasar466@gmail.com';

-- Verify:
SELECT id, email, plan, is_super_admin, account_status
FROM public.profiles
WHERE is_super_admin = true;
