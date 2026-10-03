// Run this script to apply the database schema to Supabase
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wdokcbiurmurmdikkiot.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkb2tjYml1cm11cm1kaWtraW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTM3MDksImV4cCI6MjEwNjUyOTcwOX0.kBblMPQJRqTkixftamJjaYFUuTzBEIPXTfKYNXXbb4s';

// Split schema into individual statements (skip comments and empty lines)
const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
const rawSQL = fs.readFileSync(schemaPath, 'utf8');

// Run statements one at a time through the REST API
const statements = rawSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let idx = 0;

async function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql + ';' });
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

console.log(`Found ${statements.length} SQL statements to run...`);
statements.forEach((s, i) => {
  const preview = s.substring(0, 60).replace(/\n/g, ' ');
  console.log(`[${i+1}] ${preview}...`);
});
