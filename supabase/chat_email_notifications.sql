-- Run this once in the Supabase SQL Editor.
-- It holds one pending reminder per recipient and chat scope, so new messages
-- reset the same 30-minute timer instead of creating additional emails.
CREATE TABLE IF NOT EXISTS public.chat_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  scope_key text NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('channel', 'direct')),
  channel text,
  conversation_id uuid REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  message_preview text NOT NULL,
  due_at timestamptz NOT NULL,
  seen_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chat_email_notifications_scope_unique UNIQUE (recipient_id, scope_key),
  CONSTRAINT chat_email_notifications_scope_check CHECK (
    (message_type = 'channel' AND channel IS NOT NULL AND conversation_id IS NULL)
    OR (message_type = 'direct' AND channel IS NULL AND conversation_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS chat_email_notifications_due_idx
  ON public.chat_email_notifications (due_at)
  WHERE seen_at IS NULL AND sent_at IS NULL;

ALTER TABLE public.chat_email_notifications ENABLE ROW LEVEL SECURITY;
