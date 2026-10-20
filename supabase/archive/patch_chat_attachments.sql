ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS attachment_name text;
