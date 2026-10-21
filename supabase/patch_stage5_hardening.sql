-- Stage 5: timer fix, rate limiting, error log.
-- Run once in the Supabase SQL Editor (after patch_stage4_cleanup.sql).
-- Safe to re-run.

BEGIN;

-- ── 1. Timer: skip zero-length slices ────────────────────────────────────────
-- A slice under ~0.2s rounds to 0 hours, which time_entries rejects; stopping
-- such a timer (e.g. a session ending just after midnight) failed and left the
-- timer stuck. Those slivers are now skipped.
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
    IF round(extract(epoch FROM v_cut - v_start)::numeric / 3600, 4) > 0 THEN
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

-- ── 2. Rate limiting (used by the API with the service role) ─────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;  -- server only: no policies
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;

-- Counts one hit for `p_key` in the current fixed window and returns true if
-- it is within `p_limit` hits per `p_window_seconds`.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits   integer;
BEGIN
  INSERT INTO public.rate_limit_hits (key, window_start, hits)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limit_hits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon, authenticated, public;

-- ── 3. Error log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_errors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source     text NOT NULL CHECK (source IN ('browser', 'server')),
  message    text NOT NULL,
  stack      text,
  url        text,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_agent text,
  digest     text
);
CREATE INDEX IF NOT EXISTS idx_app_errors_created ON public.app_errors (created_at DESC);
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_errors FROM anon, authenticated;
GRANT SELECT ON public.app_errors TO authenticated;
DROP POLICY IF EXISTS "Admins can view errors" ON public.app_errors;
CREATE POLICY "Admins can view errors" ON public.app_errors
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');

COMMIT;

-- ── Check ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('rate_limit_hits', 'app_errors')) AS new_tables,
  (SELECT prosrc LIKE '%round(extract(epoch FROM v_cut - v_start)::numeric / 3600, 4) > 0%' FROM pg_proc WHERE proname = 'stop_task_timer') AS timer_fix_applied;
