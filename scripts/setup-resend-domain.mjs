/**
 * Registers blessedpathholdings.com with Resend and prints the DNS records
 * that must be added to your domain registrar to verify ownership.
 *
 * Run with: node scripts/setup-resend-domain.mjs
 */

import { Resend } from 'resend';
import { readFileSync } from 'fs';

// Parse .env.local manually (no dotenv dependency needed)
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const apiKey = env['RESEND_API_KEY'];
if (!apiKey) {
  console.error('❌  RESEND_API_KEY not found in .env.local');
  process.exit(1);
}

const resend = new Resend(apiKey);

console.log('\n🚀  Registering domain with Resend...\n');

const { data, error } = await resend.domains.create({
  name: 'blessedpathholdings.com',
});

if (error) {
  // "Domain already exists" is fine — just list it instead
  if (error.message?.toLowerCase().includes('already')) {
    console.log('ℹ️   Domain already registered. Fetching details...\n');
    const { data: list, error: listErr } = await resend.domains.list();
    if (listErr) {
      console.error('❌  Could not list domains:', listErr.message);
      process.exit(1);
    }
    const domain = list?.data?.find((d) => d.name === 'blessedpathholdings.com');
    if (domain) {
      printDomain(domain);
    } else {
      console.log('Could not find domain in list. Check your Resend dashboard.');
    }
  } else {
    console.error('❌  Failed to create domain:', error.message);
    process.exit(1);
  }
} else {
  printDomain(data);
}

function printDomain(domain) {
  console.log(`✅  Domain: ${domain.name}`);
  console.log(`   Status : ${domain.status}`);
  console.log(`   Region : ${domain.region ?? 'us-east-1'}\n`);

  if (domain.records?.length) {
    console.log('📋  Add these DNS records to your domain registrar:\n');
    console.log(
      '  Type'.padEnd(10) +
      'Name'.padEnd(40) +
      'Value'
    );
    console.log('  ' + '-'.repeat(100));
    for (const r of domain.records) {
      console.log(
        `  ${(r.type ?? '').padEnd(8)}  ${(r.name ?? '').padEnd(38)}  ${r.value ?? r.data ?? ''}`
      );
    }
    console.log('\n  After adding the records, verify in your Resend dashboard or run:');
    console.log(`  resend.domains.verify({ id: '${domain.id}' })\n`);
  } else {
    console.log('  No DNS records returned — check your Resend dashboard for verification details.');
  }
}
