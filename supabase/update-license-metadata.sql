-- Update existing license to add original key format to metadata
-- This adds the dashed format back for Creem API calls

UPDATE public.licenses
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{original_key}',
  to_jsonb(
    -- Add dashes back in the standard format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
    SUBSTRING(license_key FROM 1 FOR 5) || '-' ||
    SUBSTRING(license_key FROM 6 FOR 5) || '-' ||
    SUBSTRING(license_key FROM 11 FOR 5) || '-' ||
    SUBSTRING(license_key FROM 16 FOR 5) || '-' ||
    SUBSTRING(license_key FROM 21 FOR 5)
  )
)
WHERE license_key = 'THR4GK4SO47I06FSTX2T0ZG75'
  AND (metadata->>'original_key' IS NULL);

SELECT 'License metadata updated!' as status;
