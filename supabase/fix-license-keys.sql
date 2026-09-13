-- Fix existing license keys by removing dashes
-- This normalizes all license keys to match our new format

UPDATE public.licenses
SET license_key = REPLACE(license_key, '-', '')
WHERE license_key LIKE '%-%';

-- Also fix any profiles that reference these license keys
UPDATE public.profiles
SET license_key = REPLACE(license_key, '-', '')
WHERE license_key LIKE '%-%';

SELECT 'License keys normalized!' as status;
