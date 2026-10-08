-- Run this once in the Supabase SQL Editor before deploying the matching app code.
-- It provides persistent in-app notifications and idempotent message creation.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  href text NOT NULL,
  entity_type text,
  entity_id uuid,
  event_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_recipient_event_unique UNIQUE (recipient_id, event_key)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS client_message_id uuid;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_sender_client_message_unique
  ON public.chat_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS direct_messages_sender_client_message_unique
  ON public.direct_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_rel pr
       JOIN pg_class c ON c.oid = pr.prrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_publication p ON p.oid = pr.prpubid
       WHERE p.pubname = 'supabase_realtime'
         AND n.nspname = 'public'
         AND c.relname = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
