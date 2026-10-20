-- ================================================================
-- StaffSuite — Fix: Unable to Add New User
-- Run this ONCE in the Supabase SQL Editor
--
-- What this fixes:
--   1. Replaces the broken trigger function with a safe version
--      that handles missing/invalid metadata gracefully.
--   2. Re-attaches the trigger in case it was dropped.
--   3. Grants the trigger function the correct privileges.
--   4. Adds an admin-level INSERT policy on profiles so the
--      upsert from the API route never gets blocked by RLS.
-- ================================================================


-- ── Step 1: Drop & recreate the trigger function safely ──────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role       user_role;
  v_rate       numeric;
  v_full_name  text;
  v_department text;
BEGIN
  -- Safely resolve full_name
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', '');

  -- Safely cast role (default to 'employee' if missing or invalid)
  BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'employee')::user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := 'employee';
  END;

  -- Safely resolve department
  v_department := NULLIF(COALESCE(new.raw_user_meta_data->>'department', ''), '');

  -- Safely cast hourly_rate (default to 0 if missing or invalid)
  BEGIN
    v_rate := COALESCE((new.raw_user_meta_data->>'hourly_rate')::numeric, 0.00);
  EXCEPTION WHEN others THEN
    v_rate := 0.00;
  END;

  INSERT INTO public.profiles (id, email, full_name, role, department, hourly_rate)
  VALUES (
    new.id,
    new.email,
    v_full_name,
    v_role,
    v_department,
    v_rate
  )
  ON CONFLICT (id) DO UPDATE SET
    email       = EXCLUDED.email,
    full_name   = EXCLUDED.full_name,
    role        = EXCLUDED.role,
    department  = EXCLUDED.department,
    hourly_rate = EXCLUDED.hourly_rate;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Step 2: Re-attach the trigger (safe — drops first if exists) ─

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── Step 3: Ensure the function owner has insert rights ──────────
--  (Supabase runs SECURITY DEFINER functions as the function owner.
--   This guarantees it can bypass RLS when inserting profiles.)

GRANT USAGE ON SCHEMA public TO postgres;
GRANT INSERT, UPDATE ON public.profiles TO postgres;


-- ── Step 4: Add an admin-level INSERT policy on profiles ─────────
--  (Allows the API route's upsert call via the service-role client
--   to create profiles even when RLS is ON.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'Admins can insert profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can insert profiles"
        ON profiles FOR INSERT
        WITH CHECK (get_user_role(auth.uid()) = 'admin');
    $policy$;
  END IF;
END$$;


-- ── Step 5: Verify ───────────────────────────────────────────────
--  After running, confirm the trigger exists:

SELECT
  tgname   AS trigger_name,
  proname  AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname = 'on_auth_user_created';
