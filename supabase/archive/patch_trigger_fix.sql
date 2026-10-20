-- ================================================
-- Fix: Make the handle_new_user trigger safe
-- Run this in the Supabase SQL Editor
-- ================================================

-- The trigger must not crash when role metadata is missing or invalid.
-- We wrap the role cast safely and use ON CONFLICT properly.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_rate numeric;
BEGIN
  -- Safely cast role (default to 'employee' if missing or invalid)
  BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'employee')::user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := 'employee';
  END;

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
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    NULLIF(COALESCE(new.raw_user_meta_data->>'department', ''), ''),
    v_rate
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    role        = EXCLUDED.role,
    department  = EXCLUDED.department,
    hourly_rate = EXCLUDED.hourly_rate;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
