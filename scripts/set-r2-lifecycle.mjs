/**
 * R2 Lifecycle Rule — clean up unverified uploads
 * ===============================================
 * Chat uploads land in `staging/` first and are moved out once
 * /api/chat/verify-upload has checked them. Uploads that are abandoned or
 * never verified would otherwise stay in staging forever. This adds a rule
 * that deletes anything under `staging/` one day after it was uploaded.
 *
 * Existing lifecycle rules on the bucket are kept; only the rule with the ID
 * below is added or replaced. Safe to run more than once:
 *   node scripts/set-r2-lifecycle.mjs
 *
 * Prerequisites: .env.local with R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * CLOUDFLARE_ACCOUNT_ID and R2_BUCKET_NAME.
 */

import {
  S3Client,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, '../.env.local'));

const RULE_ID = 'delete-unverified-staging-uploads';
const bucket = process.env.R2_BUCKET_NAME || 'blessedpathstaffsuite';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

let existing = [];
try {
  const current = await r2.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
  existing = current.Rules ?? [];
} catch (error) {
  // No lifecycle configuration yet.
  if (error?.name !== 'NoSuchLifecycleConfiguration' && error?.$metadata?.httpStatusCode !== 404) throw error;
}

const rules = [
  ...existing.filter(rule => rule.ID !== RULE_ID),
  {
    ID: RULE_ID,
    Status: 'Enabled',
    Filter: { Prefix: 'staging/' },
    Expiration: { Days: 1 },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
  },
];

await r2.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: bucket,
  LifecycleConfiguration: { Rules: rules },
}));

const check = await r2.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
console.log(`Lifecycle rules on ${bucket}:`);
for (const rule of check.Rules ?? []) {
  console.log(`  - ${rule.ID}: ${rule.Status}, prefix "${rule.Filter?.Prefix ?? ''}", expire after ${rule.Expiration?.Days ?? '—'} day(s)`);
}
