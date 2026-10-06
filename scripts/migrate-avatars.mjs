import { createClient } from '@supabase/supabase-js';
import s3 from '@aws-sdk/client-s3';
const { PutObjectCommand, S3Client } = s3;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const { data: profiles, error } = await supabase.from('profiles').select('id, avatar_url').not('avatar_url', 'is', null);
if (error) throw error;
let migrated = 0;
let skipped = 0;

for (const profile of profiles || []) {
  if (!profile.avatar_url?.startsWith('http')) { skipped++; continue; }
  const response = await fetch(profile.avatar_url);
  if (!response.ok) { console.error(`Skipped ${profile.id}: source returned ${response.status}`); skipped++; continue; }
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `avatars/${profile.id}/profile.${extension}`;
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: Buffer.from(await response.arrayBuffer()), ContentType: contentType }));
  const avatarUrl = `/api/files/${key}?v=${Date.now()}`;
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id);
  if (updateError) throw updateError;
  migrated++;
  console.log(`Migrated ${profile.id}`);
}

console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped.`);
