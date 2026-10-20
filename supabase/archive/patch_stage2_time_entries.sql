-- Stage 2: server-side time tracking and monthly payroll.
-- Run once in the Supabase SQL Editor, after patch_stage1_security.sql.
-- Safe to re-run.
--
-- What this does:
--  * Every block of worked time is stored in public.time_entries, dated in
--    Lagos time and stamped with the person's hourly rate at that moment, so
--    monthly totals are exact and later rate changes don't rewrite past pay.
--  * Timer start/stop and hour changes happen only through the functions
--    below; the elapsed time is computed by the database, not the browser.
--  * Browsers can no longer write to public.tasks directly (all task writes
--    already go through the app's API).
--  * monthly_hours_report / monthly_hours_by_day give accountants and admins
--    per-person totals for any month, for every role.
--  * Existing hours are copied into time_entries as 'legacy' entries.

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lagos_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'Africa/Lagos')::date $$;

-- ── Time entries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  work_date   date NOT NULL,
  -- Positive for worked time; negative only for manual corrections.
  hours       numeric(8, 4) NOT NULL CHECK (hours <> 0 AND hours BETWEEN -24 AND 24),
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 0,
  source      text NOT NULL CHECK (source IN ('timer', 'manual', 'legacy')),
  started_at  timestamptz,
  ended_at    timestamptz,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_date_user ON public.time_entries (work_date, user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON public.time_entries (task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks (user_id);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.time_entries FROM anon, authenticated;
GRANT SELECT ON public.time_entries TO authenticated;

DROP POLICY IF EXISTS "Users can view own time entries" ON public.time_entries;
CREATE POLICY "Users can view own time entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins and accountants can view all time entries" ON public.time_entries;
CREATE POLICY "Admins and accountants can view all time entries" ON public.time_entries
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'accountant'));

-- Stamp each entry with the person's current hourly rate.
CREATE OR REPLACE FUNCTION public.time_entries_set_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(hourly_rate, 0) INTO NEW.hourly_rate FROM public.profiles WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS time_entries_set_rate ON public.time_entries;
CREATE TRIGGER time_entries_set_rate
  BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_set_rate();

-- ── Tasks: no direct writes from browsers ────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.tasks FROM anon, authenticated;

-- Keeps tasks.hours_spent equal to the sum of the task's entries.
CREATE OR REPLACE FUNCTION public.refresh_task_hours(p_task_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tasks
  SET hours_spent = GREATEST(0, COALESCE((SELECT sum(hours) FROM public.time_entries WHERE task_id = p_task_id), 0))
  WHERE id = p_task_id;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_task_hours(uuid) FROM anon, authenticated, public;

-- Only the task's owner, or an admin, may change its time.
CREATE OR REPLACE FUNCTION public.assert_can_edit_task_time(p_task public.tasks)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;
  IF p_task.user_id <> auth.uid() AND public.get_user_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'You can only track time on your own tasks.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_can_edit_task_time(public.tasks) FROM anon, authenticated, public;

-- ── Timer ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_task_timer(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.assert_can_edit_task_time(v_task);
  IF v_task.is_timer_running THEN RETURN v_task; END IF;

  -- One running timer per person, so time is never counted twice.
  IF EXISTS (SELECT 1 FROM public.tasks
             WHERE user_id = v_task.user_id AND is_timer_running AND id <> p_task_id) THEN
    RAISE EXCEPTION 'Stop your other running timer first.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tasks
  SET is_timer_running = true, timer_start_time = now(), status = 'in_progress'
  WHERE id = p_task_id
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$$;

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

  -- Record the session, split at each Lagos midnight so every hour lands on
  -- the day (and month) it was actually worked.
  v_start := LEAST(v_task.timer_start_time, v_end);
  WHILE v_start < v_end LOOP
    v_cut := LEAST(
      v_end,
      (((v_start AT TIME ZONE 'Africa/Lagos')::date + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
    );
    IF v_cut > v_start THEN
      INSERT INTO public.time_entries (user_id, task_id, work_date, hours, source, started_at, ended_at, created_by)
      VALUES (v_task.user_id, p_task_id, (v_start AT TIME ZONE 'Africa/Lagos')::date,
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

-- ── Manual hours ─────────────────────────────────────────────────────────────
-- Sets a task's total hours. The difference is recorded as a 'manual' entry on
-- p_work_date, so accountants can see which hours were typed in by hand.
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
  IF p_work_date IS NULL OR p_work_date > public.lagos_today() THEN
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

REVOKE EXECUTE ON FUNCTION public.start_task_timer(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stop_task_timer(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_task_hours(uuid, numeric, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.start_task_timer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_task_timer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_hours(uuid, numeric, date) TO authenticated;

-- ── Monthly reports (admins and accountants only) ────────────────────────────
-- p_month is any date in the month; every role is included. Staff with no
-- hours that month are listed with 0 unless their invitation is still pending.
CREATE OR REPLACE FUNCTION public.monthly_hours_report(p_month date)
RETURNS TABLE (
  user_id uuid, full_name text, email text, role public.user_role, department text,
  avatar_url text, current_rate numeric, total_hours numeric, timer_hours numeric,
  manual_hours numeric, total_pay numeric, days_worked integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Only admins and accountants can view payroll.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH e AS (
    SELECT te.user_id,
           sum(te.hours) AS total_hours,
           sum(te.hours) FILTER (WHERE te.source = 'timer') AS timer_hours,
           sum(te.hours) FILTER (WHERE te.source <> 'timer') AS manual_hours,
           sum(te.hours * te.hourly_rate) AS total_pay,
           count(DISTINCT te.work_date) FILTER (WHERE te.hours > 0) AS days_worked
    FROM public.time_entries te
    WHERE te.work_date >= date_trunc('month', p_month)::date
      AND te.work_date <  (date_trunc('month', p_month) + interval '1 month')::date
    GROUP BY te.user_id
  )
  SELECT p.id, p.full_name, p.email, p.role, p.department, p.avatar_url,
         COALESCE(p.hourly_rate, 0),
         round(COALESCE(e.total_hours, 0), 2),
         round(COALESCE(e.timer_hours, 0), 2),
         round(COALESCE(e.manual_hours, 0), 2),
         round(COALESCE(e.total_pay, 0), 2),
         COALESCE(e.days_worked, 0)::integer
  FROM public.profiles p
  LEFT JOIN e ON e.user_id = p.id
  WHERE e.user_id IS NOT NULL OR p.invitation_accepted
  ORDER BY COALESCE(e.total_hours, 0) DESC, p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.monthly_hours_by_day(p_month date)
RETURNS TABLE (user_id uuid, work_date date, hours numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Only admins and accountants can view payroll.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT te.user_id, te.work_date, round(sum(te.hours), 2)
  FROM public.time_entries te
  WHERE te.work_date >= date_trunc('month', p_month)::date
    AND te.work_date <  (date_trunc('month', p_month) + interval '1 month')::date
  GROUP BY te.user_id, te.work_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.monthly_hours_report(date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.monthly_hours_by_day(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.monthly_hours_report(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_hours_by_day(date) TO authenticated;

-- ── Copy existing hours into time_entries (once per task) ────────────────────
-- Totals over 24h are stored as several entries of at most 24h each.
INSERT INTO public.time_entries (user_id, task_id, work_date, hours, source)
SELECT t.user_id, t.id, COALESCE(t.date_worked, (t.created_at AT TIME ZONE 'Africa/Lagos')::date),
       LEAST(24, t.hours_spent - g.n * 24), 'legacy'
FROM public.tasks t
CROSS JOIN LATERAL generate_series(0, ceil(t.hours_spent / 24)::int - 1) AS g(n)
WHERE t.hours_spent > 0
  AND t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id);

COMMIT;

-- ── Check: task totals vs. time entries (both columns should match) ──────────
SELECT
  (SELECT round(sum(hours_spent), 2) FROM public.tasks) AS task_hours,
  (SELECT round(sum(hours), 2) FROM public.time_entries) AS entry_hours,
  (SELECT count(*) FROM public.time_entries) AS entries;
