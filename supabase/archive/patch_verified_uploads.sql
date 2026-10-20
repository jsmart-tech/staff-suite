CREATE TABLE IF NOT EXISTS public.verified_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staging_key text NOT NULL,
  public_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verified_uploads_user_key ON public.verified_uploads(user_id, public_key);
