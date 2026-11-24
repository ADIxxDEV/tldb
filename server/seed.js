// Seed TLDB with the admin account and the Physics Wallah company record.
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

// ---- the one rights holder we list ----
const companySlug = slugify('Physics Wallah');
if (!(await q.get(`SELECT id FROM companies WHERE slug = ?`, companySlug))) {
  await q.run(
    `INSERT INTO companies (slug, name, kind, domain, country) VALUES (?,?,?,?,?)`,
    companySlug, 'Physics Wallah', 'publisher', 'pw.live', 'India');
  console.log('Company added → Physics Wallah (pw.live)');
} else {
  console.log('Company already exists → Physics Wallah');
}

const n = await q.get(`SELECT COUNT(*) AS c FROM lectures`);
console.log(`Lectures in catalog: ${n.c}`);
console.log('Done.');
process.exit(0);
