// Import records in a provider format (PW / Physics Wallah by default) via the admin API.
// Usage:
//   node scripts/import-pw.js                                   # local, data/pw-sample.json
//   node scripts/import-pw.js https://tldb.eapp.workers.dev admin@tldb.local 'PASSWORD' data/pw-sample.json
// The payload format is documented in data/pw-sample.json (_format).
'use strict';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173';
const EMAIL = process.argv[3] || 'admin@tldb.local';
const PASSWORD = process.argv[4] || 'changeme123';
const FILE = process.argv[5] || 'data/pw-sample.json';

const payload = JSON.parse(readFileSync(FILE, 'utf8'));
delete payload._format;

let cookie = '';
async function api(path, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

await api('/auth/login', { body: { email: EMAIL, password: PASSWORD } });
const r = await api('/admin/import', { body: payload });
console.log(`provider ${r.provider}: created ${r.created}, skipped ${r.skipped} (already present), failed ${r.failed}`);
for (const rec of r.records) console.log('  +', rec.id, rec.external_id, '/' + rec.slug);
