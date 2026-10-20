-- Run this once to move existing pending reminders to the 10-minute policy.
UPDATE public.chat_email_notifications
SET due_at = LEAST(due_at, timezone('utc'::text, now()) + interval '10 minutes'),
    updated_at = timezone('utc'::text, now())
WHERE seen_at IS NULL AND sent_at IS NULL;
