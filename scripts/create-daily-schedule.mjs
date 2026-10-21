/**
 * QStash schedule for the nightly maintenance job
 * ===============================================
 * Calls POST /api/cron/daily every night at 03:00 US Eastern time
 * (database backup to R2, removal of unverified uploads, old-record cleanup).
 *
 * Safe to run more than once: an existing schedule for the same URL is reused.
 *   node scripts/create-daily-schedule.mjs
 *
 * Prerequisites: .env.local with QSTASH_TOKEN (and QSTASH_URL if not the
 * default region) and NEXT_PUBLIC_SITE_URL set to the production URL.
 */

import { Client } from '@upstash/qstash';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, '../.env.local'));

const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
if (!site.startsWith('https://')) throw new Error('NEXT_PUBLIC_SITE_URL must be the https production URL.');
const destination = `${site}/api/cron/daily`;
const cron = 'CRON_TZ=America/New_York 0 3 * * *';

const client = new Client({
  token: process.env.QSTASH_TOKEN,
  ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
});

const existing = (await client.schedules.list()).filter(s => s.destination === destination);
if (existing.length) {
  console.log(`Schedule already exists for ${destination}: ${existing.map(s => `${s.scheduleId} (${s.cron})`).join(', ')}`);
} else {
  const { scheduleId } = await client.schedules.create({ destination, cron, retries: 3 });
  console.log(`Created schedule ${scheduleId}: ${cron} → ${destination}`);
}
