-- Expose invitation state so chat and other staff directories can exclude
-- accounts that have not accepted their invitation yet.
CREATE OR REPLACE VIEW public.staff_directory AS
  SELECT id, full_name, email, role, avatar_url, department, invitation_accepted
  FROM public.profiles;

GRANT SELECT ON public.staff_directory TO authenticated;
