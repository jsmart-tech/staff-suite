-- ================================================
-- StaffSuite — Supabase Database Setup Script
-- Run this in the Supabase SQL Editor
-- ================================================

-- 1. Create user role enum
CREATE TYPE user_role AS ENUM ('admin', 'accountant', 'employee');

-- 2. Profiles table (extends auth.users)
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  role user_role DEFAULT 'employee',
  department text,
  hourly_rate numeric(10, 2) DEFAULT 0.00,
  avatar_url text,
  resume_url text,
  phone text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 3. Login audit logs
CREATE TABLE login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  login_time timestamp with time zone DEFAULT timezone('utc'::text, now()),
  ip_address text
);

-- 4. Tasks & time logs
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text CHECK (status IN ('in_progress', 'completed', 'blocked')) DEFAULT 'in_progress',
  hours_spent numeric(6, 2) DEFAULT 0.00,
  date_worked date DEFAULT CURRENT_DATE,
  start_date date DEFAULT CURRENT_DATE,
  due_date date,
  is_timer_running boolean DEFAULT false,
  timer_start_time timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date DEFAULT CURRENT_DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date;

-- 5. Realtime chat messages
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  attachment_url text,
  channel text DEFAULT 'general',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get role
CREATE OR REPLACE FUNCTION get_user_role(user_id uuid)
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- PROFILES policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Accountants can view all profiles"
  ON profiles FOR SELECT USING (get_user_role(auth.uid()) = 'accountant');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Allow profile creation on signup"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- LOGIN_LOGS policies
CREATE POLICY "Users can insert own login logs"
  ON login_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all login logs"
  ON login_logs FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view own login logs"
  ON login_logs FOR SELECT USING (auth.uid() = user_id);

-- TASKS policies
CREATE POLICY "Users can manage own tasks"
  ON tasks FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all tasks"
  ON tasks FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Accountants can view all tasks"
  ON tasks FOR SELECT USING (get_user_role(auth.uid()) = 'accountant');

-- CHAT_MESSAGES policies
CREATE POLICY "Authenticated users can read messages"
  ON chat_messages FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can send messages"
  ON chat_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- ================================================
-- REALTIME — Enable for chat_messages & tasks
-- ================================================

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ================================================
-- TRIGGER: Auto-create profile on user signup
-- ================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'employee'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================
-- STORAGE — Create avatars bucket
-- ================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
