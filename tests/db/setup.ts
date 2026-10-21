import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

// Minimal stand-ins for what Supabase provides: auth, storage, roles, realtime.
const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE PUBLICATION supabase_realtime;
  GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
`;

export const ADMIN = '44444444-4444-4444-4444-444444444444';
export const ACCOUNTANT = '33333333-3333-3333-3333-333333333333';
export const EMPLOYEE = '11111111-1111-1111-1111-111111111111';
export const EMPLOYEE_2 = '22222222-2222-2222-2222-222222222222';

/** A fresh database built from supabase/schema.sql, with four users. */
export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/schema.sql'), 'utf8'));
  // Users arrive through the auth trigger (which ignores role/rate metadata),
  // then are promoted from the SQL editor, as in supabase/README.md.
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${ADMIN}', 'admin@test', '{"full_name":"Admin","role":"admin","hourly_rate":999}'),
      ('${ACCOUNTANT}', 'acc@test', '{"full_name":"Accountant"}'),
      ('${EMPLOYEE}', 'emp@test', '{"full_name":"Employee One","role":"admin"}'),
      ('${EMPLOYEE_2}', 'emp2@test', '{"full_name":"Employee Two"}');
    UPDATE public.profiles SET role = 'admin', hourly_rate = 50 WHERE id = '${ADMIN}';
    UPDATE public.profiles SET role = 'accountant', hourly_rate = 30 WHERE id = '${ACCOUNTANT}';
    UPDATE public.profiles SET hourly_rate = 20 WHERE id = '${EMPLOYEE}';
    UPDATE public.profiles SET hourly_rate = 25 WHERE id = '${EMPLOYEE_2}';
  `);

  /** Runs SQL as a signed-in user (RLS and grants apply). */
  const as = async (userId: string | null, sql: string, params?: unknown[]) => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId ?? ''}', false); SET ROLE ${userId ? 'authenticated' : 'anon'};`);
    try { return await db.query<Record<string, unknown>>(sql, params); }
    finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
  };
  return { db, as };
}
