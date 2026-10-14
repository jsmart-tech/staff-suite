/**
 * R2 CORS Configuration
 * =====================
 * The browser's XHR PUT to the presigned URL originates from the Vercel app
 * domain. R2 requires an explicit CORS policy on the bucket to allow this.
 *
 * Run this script ONCE with:
 *   node scripts/set-r2-cors.mjs
 *
 * Prerequisites: your .env.local must have R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * CLOUDFLARE_ACCOUNT_ID, and R2_BUCKET_NAME set.
 */

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Node 20+ provides a built-in dotenv loader; keep this utility independent
// from the application's runtime dependencies.
process.loadEnvFile(resolve(__dirname, '../.env.local'));

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const corsConfig = {
  CORSRules: [
    {
      // Allow presigned PUT uploads from your Vercel app and local dev
      AllowedOrigins: [
        'https://staff-suite.vercel.app',
        'http://localhost:3000',
        // Add any preview deployment patterns e.g. 'https://staff-suite-*.vercel.app'
      ],
      AllowedMethods: ['PUT'],
      AllowedHeaders: ['Content-Type'],
      MaxAgeSeconds: 3600,
    },
    {
      // Allow the CDN Worker (and browser) to GET objects cross-origin
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds: 86400,
    },
  ],
};

const bucket = process.env.R2_BUCKET_NAME || 'blessedpathstaffsuite';

console.log(`Setting CORS on bucket: ${bucket}`);
await r2.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: corsConfig,
}));
console.log('CORS policy applied successfully.');
console.log('AllowedOrigins for PUT:', corsConfig.CORSRules[0].AllowedOrigins);
