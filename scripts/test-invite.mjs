// Quick test: tries to send a Supabase invite and reports success/failure
// Run with: node scripts/test-invite.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local manually
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
);

const url        = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!url || !serviceKey) {
  console.error('❌  Missing env vars — check .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Use a clearly fake address so no real email goes out unless SMTP works
const TEST_EMAIL = `smtp-test-${Date.now()}@example.com`;

console.log(`\n🔍  Testing invite to: ${TEST_EMAIL}`);
console.log(`   Supabase URL: ${url}\n`);

const { data, error } = await admin.auth.admin.inviteUserByEmail(TEST_EMAIL, {
  data: { role: 'employee', full_name: 'SMTP Test' },
});

if (error) {
  console.error('❌  Invite call failed:\n   ', error.message);
  if (error.message.toLowerCase().includes('smtp')) {
    console.error('\n   ⚠️   SMTP is not connected. Check Supabase → Auth → SMTP Settings.');
  }
} else {
  console.log('✅  Supabase accepted the invite request.');
  console.log(`   User ID: ${data.user?.id}`);
  console.log('\n   If SMTP is configured with Resend, the email was sent from your domain.');
  console.log('   If SMTP is NOT configured, Supabase uses its default mailer (may be rate-limited).');

  // Clean up — delete the test user immediately
  if (data.user?.id) {
    await admin.auth.admin.deleteUser(data.user.id);
    console.log('   🗑️   Test user cleaned up.');
  }
}
