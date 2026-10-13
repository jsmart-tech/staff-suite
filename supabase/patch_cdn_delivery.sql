-- Add attachment_cdn_url to both message tables so the stable CDN URL is
-- stored on the row and never rebuilt on every render.
--
-- For rows already created before this migration the existing attachment_url
-- value is kept as-is (it may be an /api/files/… proxy path).  New rows will
-- have the CDN URL written directly into attachment_url by the API layer.
-- This column is kept for documentation; the API now writes CDN URLs into
-- attachment_url directly, so no additional column is required.

-- Ensure attachment_mime_type exists on both tables (idempotent).
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_mime_type text;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_mime_type text;

-- Index to quickly look up messages with attachments (optional but useful for
-- future media gallery features).
CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment
  ON public.chat_messages (channel, created_at)
  WHERE attachment_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_direct_messages_attachment
  ON public.direct_messages (conversation_id, created_at)
  WHERE attachment_url IS NOT NULL;
