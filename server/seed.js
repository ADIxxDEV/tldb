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

// ---- one batch with its structure (no lectures, no files: names + ids only) ----
const sample = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/pw-batch-sample.json', import.meta.url), 'utf8'));
const b = sample.batch;
if (!(await q.get(`SELECT id FROM batches WHERE provider = ? AND external_id = ?`, sample.provider, b.external_id))) {
  const company = await q.get(`SELECT id FROM companies WHERE slug = ?`, slugify(sample.company));
  const batchId = (await q.run(
    `INSERT INTO batches (provider, external_id, slug, name, subtitle, company_id, rights_holder, status, access,
       price, currency, certificate, certification_note, starts_on, ends_on, purchase_url, language,
       lecture_count, description, meta)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sample.provider, b.external_id, slugify(b.name), b.name, b.subtitle || '', company?.id ?? null,
    sample.company, b.status, b.access, b.price, b.currency, b.certificate, b.certification_note || '',
    b.starts_on || '', b.ends_on || '', b.purchase_url, b.language || '', b.lecture_count || 0,
    b.description || '', '{}')).lastInsertRowid;
  let subs = 0, tops = 0, items = 0;
  for (const [si, s] of sample.subjects.entries()) {
    const sId = (await q.run(
      `INSERT INTO batch_subjects (batch_id, external_id, name, position, lecture_count) VALUES (?,?,?,?,?)`,
      batchId, s.external_id || '', s.name, si, (s.topics || []).length)).lastInsertRowid;
    subs++;
    for (const [ti, t] of (s.topics || []).entries()) {
      const tId = (await q.run(
        `INSERT INTO batch_topics (subject_id, external_id, name, position, lecture_count) VALUES (?,?,?,?,?)`,
        sId, t.external_id || '', t.name, ti, (t.items || []).length)).lastInsertRowid;
      tops++;
      for (const [ii, it] of (t.items || []).entries()) {
        await q.run(
          `INSERT INTO batch_contents (topic_id, kind, title, external_id, duration_sec, url, position) VALUES (?,?,?,?,?,?,?)`,
          tId, it.kind || 'video', it.title, it.external_id || '', it.duration_sec || 0, it.url || '', ii);
        items++;
      }
    }
  }
  console.log(`Batch added → ${b.name} (${subs} subjects, ${tops} topics, ${items} items)`);
} else {
  console.log('Batch already exists →', b.name);
}

const n = await q.get(`SELECT COUNT(*) AS c FROM lectures`);
console.log(`Lectures in catalog: ${n.c}`);
console.log('Done.');
process.exit(0);
