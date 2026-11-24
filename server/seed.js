// Seed TLDB with the admin account and the rights holders we list.
// No lectures: the catalog starts empty and is filled through the contribute API
// or the admin import endpoint (see docs/AI-IMPORT.md).
'use strict';
import { q, setupDb, ensureSchema as init, hashPassword, slugify } from './db.js';

await setupDb();
await init();

// ---- admin account ----
const email = 'admin@tldb.local';
if (!(await q.get(`SELECT id FROM users WHERE email = ?`, email))) {
  const pw = process.env.TLDB_ADMIN_PW || 'changeme123';
  await q.run(`INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?, 'admin')`, email, 'TLDB Admin', await hashPassword(pw));
  console.log(`Admin created → ${email} / ${pw}  (change it on #/account)`);
} else {
  console.log('Admin already exists');
}

// ---- the rights holders we list ----
const holders = [
  { name: 'Physics Wallah', kind: 'publisher', domain: 'pw.live', country: 'India' },
  { name: 'Vibrant Academy', kind: 'publisher', domain: 'vibrantacademy.com', country: 'India' },
];
for (const h of holders) {
  const slug = slugify(h.name);
  if (await q.get(`SELECT id FROM companies WHERE slug = ?`, slug)) {
    console.log('Company already exists →', h.name);
    continue;
  }
  await q.run(
    `INSERT INTO companies (slug, name, kind, domain, country) VALUES (?,?,?,?,?)`,
    slug, h.name, h.kind, h.domain, h.country);
  console.log('Company added →', h.name, `(${h.domain})`);
}

const n = await q.get(`SELECT COUNT(*) AS c FROM lectures`);
console.log(`Lectures in catalog: ${n.c}`);
console.log('Done.');
process.exit(0);
