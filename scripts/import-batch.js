// Import a batch (course) with its subject → topic → item tree.
// Usage: node scripts/import-batch.js [base-url] [admin-email] [password] [file]
'use strict';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173';
const EMAIL = process.argv[3] || 'admin@tldb.local';
const PASSWORD = process.argv[4] || 'changeme123';
const FILE = process.argv[5] || 'data/pw-batch-sample.json';

const payload = JSON.parse(readFileSync(FILE, 'utf8'));
delete payload._format;

let cookie = '';
async function api(path, body) {
  const res = await fetch(BASE + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

await api('/auth/login', { email: EMAIL, password: PASSWORD });
const r = await api('/admin/import-batch', payload);
console.log(`batch ${r.slug} → subjects ${r.subjects}, topics ${r.topics}, items ${r.items}`);
