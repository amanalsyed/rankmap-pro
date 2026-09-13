-- Extension user feedback (bugs, feature requests, general)
-- Inserts are performed by the submit-feedback Edge Function (service role).

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'general')),
  message TEXT NOT NULL,
  extension_version TEXT,
  plan TEXT,
  page_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_category_idx ON public.feedback (category);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- No user-facing policies: only service role (Edge Function) can read/write.
