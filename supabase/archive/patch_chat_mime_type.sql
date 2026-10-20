-- Add attachment_mime_type to both message tables.
-- This column is populated server-side via magic-byte detection so the
-- client cannot spoof it.  isImage() on the client falls back to the
-- filename extension only when this column is null (legacy rows).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_mime_type text;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_mime_type text;
