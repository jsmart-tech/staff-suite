-- Run once in the Supabase SQL Editor after the existing schema and messaging scripts.
-- It prevents users changing sensitive profile fields and exposes a safe staff directory.

CREATE OR REPLACE FUNCTION public.prevent_self_service_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id
     AND public.get_user_role(auth.uid()) <> 'admin'
     AND (NEW.role IS DISTINCT FROM OLD.role
       OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
       OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'You cannot change your role, hourly rate, or email address.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_service_profile_escalation ON public.profiles;
CREATE TRIGGER prevent_self_service_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_service_profile_escalation();

DROP POLICY IF EXISTS "Authenticated users can view staff directory" ON public.profiles;

CREATE OR REPLACE VIEW public.staff_directory AS
  SELECT id, full_name, email, role, avatar_url, department
  FROM public.profiles;

GRANT SELECT ON public.staff_directory TO authenticated;
