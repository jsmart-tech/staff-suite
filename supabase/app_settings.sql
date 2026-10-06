-- ================================================
-- StaffSuite — App Settings Table Migration
-- Run this in the Supabase SQL Editor
-- ================================================

-- App-wide settings stored in a single row (id = 1)
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_name text DEFAULT 'Blessed Path Holdings',
  company_logo_url text,
  timezone text DEFAULT 'Africa/Lagos',
  work_hours_per_day integer DEFAULT 8,
  currency text DEFAULT 'NGN',
  enable_chat boolean DEFAULT true,
  enable_audit_logs boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT timezone('utc', now()),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS company_logo_url text;

-- Insert default row if it doesn't exist
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS: Only admins can read or write settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app_settings"
  ON app_settings FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update app_settings"
  ON app_settings FOR UPDATE
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can insert app_settings"
  ON app_settings FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) = 'admin');

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Company assets are publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'company-assets');

CREATE POLICY "Admins can upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-assets' AND get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update company assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-assets' AND get_user_role(auth.uid()) = 'admin');
