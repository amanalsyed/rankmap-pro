-- Add current_plan column to profiles table
-- This is needed for the new license-based payment model

-- Add current_plan column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'current_plan'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN current_plan TEXT DEFAULT 'free';
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_current_plan ON public.profiles(current_plan);

-- Add comment
COMMENT ON COLUMN public.profiles.current_plan IS 'User subscription plan: free, lifetime, etc.';

SELECT 'current_plan column added successfully!' as status;
