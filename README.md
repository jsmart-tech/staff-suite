# Blessed Path Staff Suite

Internal staff portal for Blessed Path Holdings: task tracking with a live timer, monthly payroll, team chat and private messages, notifications, and an admin area for staff, settings and login history.

Live: <https://staff-suite.vercel.app>

**Stack:** Next.js 16 (App Router) · React 19 · Supabase (Postgres, Auth, Realtime) · Cloudflare R2 (file storage) · Resend (email) · Upstash QStash (delayed reminder emails) · Vercel (hosting)

> This project uses Next.js 16, which has breaking changes from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/` before changing framework-level code.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything: invite/edit/remove staff, set pay rates, assign tasks, see all tasks, audit logs, settings, payroll |
| **Accountant** | Monthly payroll and hours reports (all roles), CSV export; own tasks |
| **Employee** | Own tasks and timer, own profile |

Everyone has team chat and private messages. There is no public sign-up; admins invite staff from **Staff → Invite**.

## Business rules

- **Money is US dollars.** Hourly rates are dollars per hour.
- **Time zone is US Eastern** (`America/New_York`, EST/EDT). Work dates, "today", monthly payroll boundaries and the timer's midnight split all use it. It is set in `BUSINESS_TIME_ZONE` (`src/lib/utils.ts`) and `business_today()` / `stop_task_timer()` (SQL); keep them in sync.
- **Pay period is monthly.** Every role's hours count towards payroll.
- **Hours come from the time log** (`time_entries`). The timer is computed by the database (sessions are split at midnight), and hours typed in by hand are checked (no future dates, ≤ 24 h per day) and flagged as *manual* in reports. Each entry stores the hourly rate at the time it was logged, so changing a rate never changes past pay.
- Role and pay-rate changes are recorded in `profile_change_log`. The database refuses to remove the last admin.

## Running locally

Requires Node 20+.

```bash
npm install
# create .env.local with the variables below
npm run dev          # http://localhost:3000
npm run build        # production build (also type-checks)
npm run lint
```

### Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (browser and server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin access. **Never expose to the browser.** |
| `NEXT_PUBLIC_SITE_URL` | Public URL used in emails and QStash callbacks |
| `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | File storage (chat attachments, avatars) |
| `NEXT_PUBLIC_CDN_URL` | Optional. Public CDN for channel files (see `workers/r2-serve.js`). Leave empty to serve everything through `/api/files` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Invitation, task and reminder emails |
| `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Delayed "unread messages" emails |
| `CHAT_REMINDER_CRON_SECRET` | Protects the fallback reminder endpoint `/api/cron/chat-email-reminders` |

## Database

`supabase/schema.sql` creates the whole database on a new Supabase project. See [`supabase/README.md`](supabase/README.md) for setup, the first admin, and how to make changes.

## Deploying

Pushing to `main` deploys to production on Vercel automatically. Database changes are **not** applied by deploys: run the SQL in the Supabase SQL Editor first, then deploy the code that needs it.

The Vercel *Preview* environment does not have the QStash and R2 keys, so preview builds fail until those are copied over.

## How things fit together

```
src/
  app/
    api/                 Server routes (all writes that need checks go here)
      tasks/             Create/edit tasks, timer start/stop, comments
      chat/              Channel messages, upload URLs, upload verification, unread
      direct-messages/   Private messages
      files/[...key]/    Serves R2 files to logged-in users (private files: members only)
      users/[userId]/    Admin edits/deletes staff
      invite/  settings/  notifications/  profile/avatar/  auth/login-log/
      qstash/  cron/     Reminder email senders
    dashboard/           Pages; admin/ and accountant/ layouts check the role on the server
  components/            UI (chat/, tasks/, accountant/, admin/, employee/, layout/, ui/)
  lib/
    utils.ts             Currency, Eastern-time dates, CSV helpers
    payroll.ts           Monthly hours/pay data hook
    chat-reminders.ts    Queue/claim/send unread-message emails
    file-types.ts        Detects real file types from file contents
    attachments.ts       Builds attachment URLs
    auth/                Current profile + server role guard
supabase/                schema.sql, pending patch, archive/
workers/r2-serve.js      Optional Cloudflare Worker CDN for channel files
scripts/                 One-off maintenance scripts (R2 CORS, Resend domain, avatar migration)
```

**File uploads:** the browser uploads straight to R2 into `staging/` using a short-lived signed URL. `/api/chat/verify-upload` then reads the file's first bytes, checks the real type, and moves it to `chat/` (channels) or `dm/` (private messages). Messages can only attach verified files. Private files are never served by the CDN; `/api/files` checks the viewer is in the conversation.

**Reminder emails:** each message queues (or pushes back) one reminder per recipient, due 10 minutes later. QStash calls `/api/qstash/chat-email-reminders` when it is due; reading the chat cancels it.
