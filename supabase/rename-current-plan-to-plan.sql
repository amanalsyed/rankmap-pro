-- Rename current_plan to plan to match the codebase convention
-- This ensures the UI can read the plan correctly

-- Rename the column
ALTER TABLE public.profiles 
RENAME COLUMN current_plan TO plan;

-- Update the index
DROP INDEX IF EXISTS idx_profiles_current_plan;
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);

-- Update comment
COMMENT ON COLUMN public.profiles.plan IS 'User subscription plan: free, lifetime, etc.';

SELECT 'Column renamed to plan successfully!' as status;
