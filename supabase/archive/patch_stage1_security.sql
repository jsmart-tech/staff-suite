-- Stage 1 security fixes. Run once in the Supabase SQL Editor, after all
-- earlier patches. Safe to re-run.
--
-- 1. New accounts can no longer choose their own role or pay rate.
-- 2. verified_uploads is locked down (it was readable/writable by anyone).
-- 3. staff_directory is no longer readable without logging in.
-- 4. get_user_role is hardened and not callable without logging in.
-- 5. Users can no longer insert their own profile row or write chat messages
--    directly — those go through the server, which validates them.

BEGIN;

-- ── 1. Signup trigger: never trust user-supplied role / hourly_rate ──────────
-- Anyone can call auth.signUp with arbitrary metadata, so the trigger must not
-- copy role or pay from it. Every new account starts as an employee at rate 0.
-- Invited staff get their real role, department and rate from /api/invite,
-- which upserts the profile with the service-role key after creating the user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, hourly_rate)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'employee'::public.user_role,
    0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles are created by the trigger above or by the service role, never by
-- the user directly (this policy let a user insert their own row as admin).
DROP POLICY IF EXISTS "Allow profile creation on signup" ON public.profiles;

-- ── 2. verified_uploads: server-only table ───────────────────────────────────
-- Only the service role (which bypasses RLS) reads or writes this table.
-- RLS on with no policies = no access for anon/authenticated.
ALTER TABLE public.verified_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_uploads FROM anon, authenticated;

-- ── 3. staff_directory: logged-in staff only ─────────────────────────────────
REVOKE ALL ON public.staff_directory FROM anon, public;
GRANT SELECT ON public.staff_directory TO authenticated;

-- ── 4. get_user_role: fixed search_path, no anonymous access ─────────────────
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- ── 5. Messages are written only by the API (service role) ───────────────────
-- The API checks channel names, length limits and verified attachments; these
-- policies let clients skip all of that by inserting rows directly.
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Conversation members can send messages" ON public.direct_messages;

COMMIT;

-- ── Check the result ─────────────────────────────────────────────────────────
-- verified_uploads should show rls_enabled = true:
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('verified_uploads', 'profiles', 'chat_messages', 'direct_messages');

-- Review admins: anyone listed here who should not be an admin may have used
-- the old signup hole. Demote them with:
--   UPDATE public.profiles SET role = 'employee', hourly_rate = 0 WHERE id = '<id>';
SELECT id, email, full_name, role, created_at
FROM public.profiles
WHERE role IN ('admin', 'accountant')
ORDER BY created_at;
