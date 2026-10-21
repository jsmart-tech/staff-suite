# Database

| File | What it is |
|---|---|
| `schema.sql` | The complete database. Run it once on a **new** Supabase project. |
| `patch_stage5_hardening.sql` | Pending change for the **existing** live database (timer fix, rate limiting, error log). Once it has been run, move it to `archive/`. |
| `archive/` | The one-off patches that built the live database, in the order they were applied. History only — **do not run them**: several older ones contain bugs that were fixed later (for example, early `handle_new_user` versions let anyone sign up as an admin). |

## New project

1. Create the Supabase project and open **SQL Editor**.
2. Paste and run `schema.sql`.
3. **Authentication → Sign In / Providers:** turn off *Allow new users to sign up*.
4. Create the first admin: add a user under **Authentication → Users**, then run
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
   ```
5. Invite everyone else from the app (**Staff → Invite**).

## Changing the database

1. Write the change as a new `patch_<short-name>.sql` that is safe to run twice (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP … IF EXISTS`).
2. Make the same change in `schema.sql`, so a new project still matches the live one.
3. Run the patch in the live SQL Editor **before** deploying code that depends on it.
4. Move the patch into `archive/` once it has been applied.
