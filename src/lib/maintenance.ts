import { gzipSync } from 'node:zlib';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2, r2Bucket } from '@/lib/r2';

// Every app table. (Login accounts and passwords live in Supabase Auth and are
// covered by Supabase's own project backups.)
const BACKUP_TABLES = [
  'profiles', 'tasks', 'time_entries', 'task_comments', 'profile_change_log',
  'chat_messages', 'direct_conversations', 'direct_messages', 'notifications',
  'login_logs', 'app_settings', 'verified_uploads', 'chat_email_notifications',
] as const;
const BACKUP_DAYS_KEPT = 30;
const STAGING_MAX_AGE_HOURS = 24;

/** Lists every object under a prefix in the R2 bucket. */
async function listObjects(prefix: string) {
  const objects: { Key: string; LastModified?: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await r2.send(new ListObjectsV2Command({ Bucket: r2Bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) if (o.Key) objects.push({ Key: o.Key, LastModified: o.LastModified });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    await r2.send(new DeleteObjectsCommand({
      Bucket: r2Bucket,
      Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })), Quiet: true },
    }));
  }
}

/** Exports all app tables as gzipped JSON to backups/YYYY-MM-DD.json.gz in R2. */
export async function backupDatabase() {
  const admin = createAdminClient();
  const snapshot: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select('*').range(from, from + 999);
      if (error) throw new Error(`Backup of ${table} failed: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    snapshot[table] = rows;
  }

  const date = new Date().toISOString().slice(0, 10);
  const key = `backups/${date}.json.gz`;
  const body = gzipSync(JSON.stringify({ createdAt: new Date().toISOString(), tables: snapshot }));
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: key, Body: body, ContentType: 'application/gzip' }));

  // Keep the last 30 days.
  const cutoff = Date.now() - BACKUP_DAYS_KEPT * 24 * 3600 * 1000;
  const old = (await listObjects('backups/')).filter(o => o.LastModified && o.LastModified.getTime() < cutoff).map(o => o.Key);
  await deleteObjects(old);

  return { key, bytes: body.length, rows: Object.fromEntries(Object.entries(snapshot).map(([t, r]) => [t, r.length])), removedOldBackups: old.length };
}

/** The newest backup in R2, if any. */
export async function latestBackup() {
  const backups = (await listObjects('backups/')).sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  const newest = backups[0];
  return newest ? { key: newest.Key, at: newest.LastModified?.toISOString() ?? null, count: backups.length } : null;
}

/** Deletes uploads that were never verified (left in staging/ for over a day). */
export async function cleanStagingUploads() {
  const cutoff = Date.now() - STAGING_MAX_AGE_HOURS * 3600 * 1000;
  const stale = (await listObjects('staging/')).filter(o => o.LastModified && o.LastModified.getTime() < cutoff).map(o => o.Key);
  await deleteObjects(stale);
  return { deleted: stale.length };
}

/** Removes old rate-limit counters (over 2 days) and error records (over 90 days). */
export async function pruneOldRecords() {
  const admin = createAdminClient();
  const day = 24 * 3600 * 1000;
  await admin.from('rate_limit_hits').delete().lt('window_start', new Date(Date.now() - 2 * day).toISOString());
  await admin.from('app_errors').delete().lt('created_at', new Date(Date.now() - 90 * day).toISOString());
}
