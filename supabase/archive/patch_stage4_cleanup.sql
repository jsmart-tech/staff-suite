-- Stage 4: Eastern time, audit trail for pay/role changes, last-admin guard,
-- server-written login logs. Run once in the Supabase SQL Editor after
-- patch_stage2_time_entries.sql. Safe to re-run.

BEGIN;

-- ── 1. Business time zone: US Eastern (EST/EDT) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.business_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/New_York')::date $$;

-- Timer sessions are split at Eastern midnight (DST handled by the zone rules).
CREATE OR REPLACE FUNCTION public.stop_task_timer(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task  public.tasks;
  v_start timestamptz;
  v_end   timestamptz := now();
  v_cut   timestamptz;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.assert_can_edit_task_time(v_task);
  IF NOT v_task.is_timer_running OR v_task.timer_start_time IS NULL THEN
    UPDATE public.tasks SET is_timer_running = false, timer_start_time = NULL
    WHERE id = p_task_id RETURNING * INTO v_task;
    RETURN v_task;
  END IF;

  v_start := LEAST(v_task.timer_start_time, v_end);
  WHILE v_start < v_end LOOP
    v_cut := LEAST(
      v_end,
      (((v_start AT TIME ZONE 'America/New_York')::date + 1)::timestamp AT TIME ZONE 'America/New_York')
    );
    IF v_cut > v_start THEN
      INSERT INTO public.time_entries (user_id, task_id, work_date, hours, source, started_at, ended_at, created_by)
      VALUES (v_task.user_id, p_task_id, (v_start AT TIME ZONE 'America/New_York')::date,
              round(extract(epoch FROM v_cut - v_start)::numeric / 3600, 4),
              'timer', v_start, v_cut, auth.uid());
    END IF;
    v_start := v_cut;
  END LOOP;

  UPDATE public.tasks SET is_timer_running = false, timer_start_time = NULL WHERE id = p_task_id;
  PERFORM public.refresh_task_hours(p_task_id);
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_task_hours(p_task_id uuid, p_total numeric, p_work_date date)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task  public.tasks;
  v_delta numeric;
  v_day   numeric;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.assert_can_edit_task_time(v_task);

  IF p_total IS NULL OR p_total < 0 THEN
    RAISE EXCEPTION 'Hours cannot be negative.' USING ERRCODE = '22023';
  END IF;
  IF p_work_date IS NULL OR p_work_date > public.business_today() THEN
    RAISE EXCEPTION 'Hours cannot be logged for a future date.' USING ERRCODE = '22023';
  END IF;

  v_delta := round(p_total - COALESCE(v_task.hours_spent, 0), 4);
  IF v_delta = 0 THEN RETURN v_task; END IF;

  SELECT COALESCE(sum(hours), 0) + v_delta INTO v_day
  FROM public.time_entries WHERE user_id = v_task.user_id AND work_date = p_work_date;
  IF v_day > 24 THEN
    RAISE EXCEPTION 'That would be more than 24 hours on %.', to_char(p_work_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_day < 0 THEN
    RAISE EXCEPTION 'Those hours were not logged on %. Set the work date to the day they were logged.', to_char(p_work_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.time_entries (user_id, task_id, work_date, hours, source, created_by)
  VALUES (v_task.user_id, p_task_id, p_work_date, v_delta, 'manual', auth.uid());
  PERFORM public.refresh_task_hours(p_task_id);
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  RETURN v_task;
END;
$$;

DROP FUNCTION IF EXISTS public.lagos_today();

-- ── 2. Audit trail for role and pay-rate changes ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_change_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  field       text NOT NULL CHECK (field IN ('role', 'hourly_rate')),
  old_value   text,
  new_value   text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profile_change_log_profile ON public.profile_change_log (profile_id, changed_at DESC);

ALTER TABLE public.profile_change_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_change_log FROM anon, authenticated;
GRANT SELECT ON public.profile_change_log TO authenticated;
DROP POLICY IF EXISTS "Admins and accountants can view profile changes" ON public.profile_change_log;
CREATE POLICY "Admins and accountants can view profile changes" ON public.profile_change_log
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'accountant'));

CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.profile_change_log (profile_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'role', OLD.role::text, NEW.role::text);
  END IF;
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    INSERT INTO public.profile_change_log (profile_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'hourly_rate', OLD.hourly_rate::text, NEW.hourly_rate::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS log_profile_changes ON public.profiles;
CREATE TRIGGER log_profile_changes
  AFTER UPDATE OF role, hourly_rate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_changes();

-- ── 3. Never remove the last admin ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'There must always be at least one admin.' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS prevent_removing_last_admin ON public.profiles;
CREATE TRIGGER prevent_removing_last_admin
  BEFORE UPDATE OF role OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_removing_last_admin();

-- ── 4. Login logs are written by the server only ─────────────────────────────
-- (The app now records logins through /api/auth/login-log with the real IP.)
DROP POLICY IF EXISTS "Users can insert own login logs" ON public.login_logs;
REVOKE INSERT, UPDATE, DELETE ON public.login_logs FROM anon, authenticated;

-- ── 5. Indexes for chat history, the audit log and conversation lookups ──────
CREATE INDEX IF NOT EXISTS idx_login_logs_time ON public.login_logs (login_time DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON public.chat_messages (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created ON public.direct_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_conversations_member_two ON public.direct_conversations (member_two);

COMMIT;

-- ── Check ────────────────────────────────────────────────────────────────────
SELECT public.business_today() AS eastern_today,
       (SELECT count(*) FROM pg_proc WHERE proname = 'lagos_today') AS old_lagos_function_left;
