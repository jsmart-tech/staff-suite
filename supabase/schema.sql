-- ============================================================================
-- Blessed Path Staff Suite — complete database schema
-- ============================================================================
-- Use this file to set up a NEW Supabase project from scratch: paste it into
-- the SQL Editor and run it once. It reflects the live database after all
-- fixes up to Stage 4 (October 2026). The older one-off patch files that built
-- the live database step by step are kept in supabase/archive/ for history
-- only — do not run them on a new project.
--
-- Conventions
--   * Money is US dollars; work dates and the timer's midnight split use
--     US Eastern time (America/New_York).
--   * Browsers read through Row Level Security. Writes that need validation
--     (tasks, hours, messages, uploads, logins) go through the app's API,
--     which uses the service role, or through the SECURITY DEFINER functions
--     below, which check permissions themselves.
-- ============================================================================

BEGIN;

-- ── Types ────────────────────────────────────────────────────────────────────
CREATE TYPE public.user_role AS ENUM ('admin', 'accountant', 'employee');

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email               text NOT NULL,
  full_name           text,
  role                public.user_role DEFAULT 'employee',
  department          text,
  hourly_rate         numeric(10, 2) DEFAULT 0.00,   -- US dollars per hour
  avatar_url          text,
  resume_url          text,
  phone               text,
  invitation_accepted boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.login_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_time timestamptz DEFAULT timezone('utc'::text, now()),
  ip_address text
);

CREATE TABLE public.tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  status           text CHECK (status IN ('in_progress', 'completed', 'blocked')) DEFAULT 'in_progress',
  -- Cached total of the task's time_entries; maintained by refresh_task_hours().
  hours_spent      numeric(6, 2) DEFAULT 0.00,
  date_worked      date DEFAULT CURRENT_DATE,
  start_date       date DEFAULT CURRENT_DATE,
  due_date         date,
  is_timer_running boolean DEFAULT false,
  timer_start_time timestamptz,
  created_at       timestamptz DEFAULT timezone('utc'::text, now())
);

-- Every block of worked time. Payroll is the sum of hours × hourly_rate here.
CREATE TABLE public.time_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  work_date   date NOT NULL,                         -- Eastern-time date
  -- Positive for worked time; negative only for manual corrections.
  hours       numeric(8, 4) NOT NULL CHECK (hours <> 0 AND hours BETWEEN -24 AND 24),
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 0,     -- rate when logged (set by trigger)
  source      text NOT NULL CHECK (source IN ('timer', 'manual', 'legacy')),
  started_at  timestamptz,
  ended_at    timestamptz,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.chat_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id            uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content              text NOT NULL,
  channel              text DEFAULT 'general',
  attachment_url       text,
  attachment_name      text,
  attachment_mime_type text,
  client_message_id    uuid,
  created_at           timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.direct_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored in sorted order (the API sorts the pair), so each pair exists once.
  member_one uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_two uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT direct_conversations_distinct_members CHECK (member_one < member_two),
  CONSTRAINT direct_conversations_unique_pair UNIQUE (member_one, member_two)
);

CREATE TABLE public.direct_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content              text NOT NULL,
  attachment_url       text,
  attachment_name      text,
  attachment_mime_type text,
  client_message_id    uuid,
  created_at           timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  -- Text, an attachment, or both.
  CONSTRAINT direct_messages_content_check CHECK (
    char_length(content) <= 5000
    AND (char_length(btrim(content)) > 0 OR attachment_url IS NOT NULL)
  )
);

-- Files that passed server-side type checks; messages may only attach these.
CREATE TABLE public.verified_uploads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staging_key text NOT NULL,
  public_key  text NOT NULL UNIQUE,
  mime_type   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 10-minute "you have unread messages" emails, one per recipient per chat.
CREATE TABLE public.chat_email_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  scope_key       text NOT NULL,
  message_type    text NOT NULL CHECK (message_type IN ('channel', 'direct')),
  channel         text,
  conversation_id uuid REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_name     text NOT NULL,
  message_preview text NOT NULL,
  due_at          timestamptz NOT NULL,
  seen_at         timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chat_email_notifications_scope_unique UNIQUE (recipient_id, scope_key),
  CONSTRAINT chat_email_notifications_scope_check CHECK (
    (message_type = 'channel' AND channel IS NOT NULL AND conversation_id IS NULL)
    OR (message_type = 'direct' AND channel IS NULL AND conversation_id IS NOT NULL)
  )
);

CREATE TABLE public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type         text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  href         text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  event_key    text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_recipient_event_unique UNIQUE (recipient_id, event_key)
);

-- Audit trail: who changed someone's role or pay rate, and when.
CREATE TABLE public.profile_change_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  field      text NOT NULL CHECK (field IN ('role', 'hourly_rate')),
  old_value  text,
  new_value  text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_settings (
  id                 integer PRIMARY KEY DEFAULT 1,
  company_name       text DEFAULT 'Blessed Path Holdings',
  company_logo_url   text,
  timezone           text DEFAULT 'America/New_York',   -- fixed; shown for reference
  work_hours_per_day integer DEFAULT 8,
  currency           text DEFAULT 'USD',                -- fixed; shown for reference
  enable_chat        boolean DEFAULT true,              -- not used by the app
  enable_audit_logs  boolean DEFAULT true,              -- not used by the app
  updated_at         timestamptz DEFAULT timezone('utc', now()),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_tasks_user ON public.tasks (user_id);
CREATE INDEX idx_time_entries_date_user ON public.time_entries (work_date, user_id);
CREATE INDEX idx_time_entries_task ON public.time_entries (task_id);
CREATE INDEX task_comments_task_created_idx ON public.task_comments (task_id, created_at DESC);
CREATE INDEX idx_login_logs_time ON public.login_logs (login_time DESC);
CREATE INDEX idx_chat_messages_channel_created ON public.chat_messages (channel, created_at DESC);
CREATE INDEX idx_direct_messages_conversation_created ON public.direct_messages (conversation_id, created_at DESC);
CREATE INDEX idx_direct_conversations_member_two ON public.direct_conversations (member_two);
CREATE UNIQUE INDEX chat_messages_sender_client_message_unique
  ON public.chat_messages (sender_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE UNIQUE INDEX direct_messages_sender_client_message_unique
  ON public.direct_messages (sender_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX idx_verified_uploads_user_key ON public.verified_uploads (user_id, public_key);
CREATE INDEX chat_email_notifications_due_idx
  ON public.chat_email_notifications (due_at) WHERE seen_at IS NULL AND sent_at IS NULL;
CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_profile_change_log_profile ON public.profile_change_log (profile_id, changed_at DESC);

-- ── Helper functions ─────────────────────────────────────────────────────────
CREATE FUNCTION public.get_user_role(user_id uuid)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = user_id; $$;

CREATE FUNCTION public.business_today()
RETURNS date
LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/New_York')::date $$;

-- ── Staff directory (names/roles for chat; no pay or contact details) ────────
CREATE VIEW public.staff_directory AS
  SELECT id, full_name, email, role, avatar_url, department, invitation_accepted
  FROM public.profiles;

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_uploads         ENABLE ROW LEVEL SECURITY;  -- server only: no policies
ALTER TABLE public.chat_email_notifications ENABLE ROW LEVEL SECURITY;  -- server only: no policies
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_change_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings             ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Accountants can view all profiles" ON public.profiles
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'accountant');
-- Role, rate and email changes are blocked for non-admins by a trigger below.
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- login_logs (rows are written by the server)
CREATE POLICY "Admins can view all login logs" ON public.login_logs
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can view own login logs" ON public.login_logs
  FOR SELECT USING (auth.uid() = user_id);

-- tasks (writes go through the API; browsers have read access only)
CREATE POLICY "Users can manage own tasks" ON public.tasks
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all tasks" ON public.tasks
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Accountants can view all tasks" ON public.tasks
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'accountant');

-- time_entries
CREATE POLICY "Users can view own time entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins and accountants can view all time entries" ON public.time_entries
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'accountant'));

-- task_comments (the API reads and writes these with the service role)
CREATE POLICY "Staff can read task comments" ON public.task_comments FOR SELECT USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
  OR public.get_user_role(auth.uid()) = 'admin'
);

-- chat (messages are written by the API)
CREATE POLICY "Authenticated users can read messages" ON public.chat_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Conversation members can read conversations" ON public.direct_conversations
  FOR SELECT USING (auth.uid() IN (member_one, member_two));
CREATE POLICY "Conversation members can read messages" ON public.direct_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.direct_conversations c
    WHERE c.id = conversation_id AND auth.uid() IN (c.member_one, c.member_two)
  ));

-- notifications
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Users can mark own notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

-- profile_change_log
CREATE POLICY "Admins and accountants can view profile changes" ON public.profile_change_log
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'accountant'));

-- app_settings (the API reads and writes these with the service role)
CREATE POLICY "Admins can read app_settings" ON public.app_settings
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update app_settings" ON public.app_settings
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin');

-- ── Privileges (on top of RLS) ───────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.tasks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.login_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages, public.direct_messages, public.direct_conversations FROM anon, authenticated;
REVOKE ALL ON public.time_entries, public.profile_change_log FROM anon, authenticated;
GRANT SELECT ON public.time_entries, public.profile_change_log TO authenticated;
REVOKE ALL ON public.verified_uploads, public.chat_email_notifications FROM anon, authenticated;
REVOKE ALL ON public.staff_directory FROM anon, public;
GRANT SELECT ON public.staff_directory TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- ── New users: every account starts as an employee at $0 ─────────────────────
-- Never trust user-supplied metadata for role or pay; /api/invite sets the
-- real role, department and rate with the service role after creating the user.
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, hourly_rate)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''), 'employee'::public.user_role, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Profile protections ──────────────────────────────────────────────────────
-- Non-admins can't change their own role, rate or email.
CREATE FUNCTION public.prevent_self_service_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
CREATE TRIGGER prevent_self_service_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_service_profile_escalation();

-- There must always be at least one admin.
CREATE FUNCTION public.prevent_removing_last_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
CREATE TRIGGER prevent_removing_last_admin
  BEFORE UPDATE OF role OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_removing_last_admin();

-- Records role and pay-rate changes in profile_change_log.
CREATE FUNCTION public.log_profile_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
CREATE TRIGGER log_profile_changes
  AFTER UPDATE OF role, hourly_rate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_changes();

-- ── Time tracking ────────────────────────────────────────────────────────────
-- Stamp each entry with the person's hourly rate at that moment.
CREATE FUNCTION public.time_entries_set_rate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(hourly_rate, 0) INTO NEW.hourly_rate FROM public.profiles WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER time_entries_set_rate
  BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_set_rate();

-- Keeps tasks.hours_spent equal to the sum of the task's entries.
CREATE FUNCTION public.refresh_task_hours(p_task_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.tasks
  SET hours_spent = GREATEST(0, COALESCE((SELECT sum(hours) FROM public.time_entries WHERE task_id = p_task_id), 0))
  WHERE id = p_task_id;
$$;

-- Only the task's owner, or an admin, may change its time.
CREATE FUNCTION public.assert_can_edit_task_time(p_task public.tasks)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE FUNCTION public.start_task_timer(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- Records the session, split at each Eastern midnight so every hour lands on
-- the day (and month) it was worked.
CREATE FUNCTION public.stop_task_timer(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- Sets a task's total hours; the difference is recorded as a 'manual' entry.
CREATE FUNCTION public.set_task_hours(p_task_id uuid, p_total numeric, p_work_date date)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- ── Monthly payroll reports (admins and accountants only) ────────────────────
CREATE FUNCTION public.monthly_hours_report(p_month date)
RETURNS TABLE (
  user_id uuid, full_name text, email text, role public.user_role, department text,
  avatar_url text, current_rate numeric, total_hours numeric, timer_hours numeric,
  manual_hours numeric, total_pay numeric, days_worked integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

CREATE FUNCTION public.monthly_hours_by_day(p_month date)
RETURNS TABLE (user_id uuid, work_date date, hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

-- Internal helpers are not callable from browsers; the rest need a login.
REVOKE EXECUTE ON FUNCTION public.refresh_task_hours(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assert_can_edit_task_time(public.tasks) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.start_task_timer(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stop_task_timer(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_task_hours(uuid, numeric, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.monthly_hours_report(date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.monthly_hours_by_day(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.start_task_timer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_task_timer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_hours(uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_hours_report(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_hours_by_day(date) TO authenticated;

-- ── Storage (Supabase) ───────────────────────────────────────────────────────
-- Chat files and avatars live in Cloudflare R2. Supabase Storage holds only
-- the company logo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;
CREATE POLICY "Company assets are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-assets');
CREATE POLICY "Admins can upload company assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'company-assets' AND public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update company assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'company-assets' AND public.get_user_role(auth.uid()) = 'admin');

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.direct_messages, public.tasks, public.notifications;

COMMIT;

-- ── After running ────────────────────────────────────────────────────────────
-- 1. Authentication → Sign In / Providers: turn OFF "Allow new users to sign up".
-- 2. Create the first admin: add a user in Authentication → Users, then run
--      UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
--    Invite everyone else from the app (Staff → Invite).
