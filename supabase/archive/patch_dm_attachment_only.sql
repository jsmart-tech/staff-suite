-- Allow private messages that contain only an attachment (no text).
-- The original rule required 1-5000 characters of text on every direct
-- message, so sending a photo or file on its own in a DM always failed.
-- Run once in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_content_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_content_check
  CHECK (
    char_length(content) <= 5000
    AND (char_length(btrim(content)) > 0 OR attachment_url IS NOT NULL)
  );
