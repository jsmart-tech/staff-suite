-- ================================================
-- StaffSuite — Additional SQL for Admin Task Assignment
-- Run this in the Supabase SQL Editor
-- ================================================

-- Allow admins to INSERT tasks for any user
-- (The existing policy only lets users manage their OWN tasks)
CREATE POLICY "Admins can insert tasks for any user"
  ON tasks FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- Allow admins to update & delete any task too (optional but useful)
CREATE POLICY "Admins can update any task"
  ON tasks FOR UPDATE
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can delete any task"
  ON tasks FOR DELETE
  USING (get_user_role(auth.uid()) = 'admin');

-- ================================================
-- ALSO: Fix the trigger so invited staff get the
-- correct role/department from invite metadata
-- (not just hardcoded 'employee')
-- ================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department, hourly_rate)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'employee')::user_role,
    COALESCE(new.raw_user_meta_data->>'department', NULL),
    COALESCE((new.raw_user_meta_data->>'hourly_rate')::numeric, 0.00)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name    = EXCLUDED.full_name,
    role         = EXCLUDED.role,
    department   = EXCLUDED.department,
    hourly_rate  = EXCLUDED.hourly_rate;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
