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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invitation_accepted boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS task_comments_task_created_idx
  ON public.task_comments (task_id, created_at DESC);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read task comments" ON public.task_comments;
CREATE POLICY "Staff can read task comments" ON public.task_comments FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can create task comments" ON public.task_comments;
CREATE POLICY "Admins can create task comments" ON public.task_comments FOR INSERT
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

UPDATE public.profiles p
SET invitation_accepted = false
FROM auth.users u
WHERE u.id = p.id
  AND (
    u.email_confirmed_at IS NULL
    OR COALESCE(u.raw_user_meta_data->>'must_set_password', 'false') = 'true'
  );

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
