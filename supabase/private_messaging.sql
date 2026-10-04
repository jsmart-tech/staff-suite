-- Run once in Supabase SQL Editor to enable private direct messages.
CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_one uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_two uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT direct_conversations_distinct_members CHECK (member_one <> member_two),
  CONSTRAINT direct_conversations_unique_pair UNIQUE (member_one, member_two)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view staff directory" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Conversation members can read conversations" ON public.direct_conversations
  FOR SELECT USING (auth.uid() IN (member_one, member_two));

CREATE POLICY "Conversation members can read messages" ON public.direct_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.direct_conversations c
    WHERE c.id = conversation_id AND auth.uid() IN (c.member_one, c.member_two)
  ));

CREATE POLICY "Conversation members can send messages" ON public.direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.direct_conversations c
    WHERE c.id = conversation_id AND auth.uid() IN (c.member_one, c.member_two)
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
