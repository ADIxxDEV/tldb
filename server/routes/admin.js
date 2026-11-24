// Admin routes (Hono): review queue, publish/reject, users, catalog management
'use strict';
import { Hono } from 'hono';
import { q, slugify, nextPublicId } from '../db.js';
import { requireRole } from '../auth.js';

export const adminRoutes = new Hono();
const adminOnly = requireRole('admin', 'moderator');

async function upsertEducator(name, bio = '', image_url = '') {
  name = String(name || '').trim();
  if (!name) return null;
  const slug = slugify(name);
  const found = await q.get(`SELECT id FROM educators WHERE slug = ?`, slug);
  if (found) {
    if (image_url) await q.run(`UPDATE educators SET image_url = ? WHERE id = ?`, image_url, found.id);
    return found.id;
  }
  return (await q.run(`INSERT INTO educators (slug, name, bio, url, image_url) VALUES (?,?,?,?,?)`, slug, name, bio || '', '', image_url || '')).lastInsertRowid;
}

async function upsertCompany(name, kind = 'publisher', domain = '') {
  name = String(name || '').trim();
  if (!name) return null;
  const slug = slugify(name);
  const found = await q.get(`SELECT id FROM companies WHERE slug = ?`, slug);
  if (found) {
    if (domain) await q.run(`UPDATE companies SET domain = ? WHERE id = ?`, domain, found.id);
    return found.id;
  }
  return (await q.run(`INSERT INTO companies (slug, name, kind, url, domain) VALUES (?,?,?,?,?)`, slug, name, kind, '', domain || '')).lastInsertRowid;
}

// feedback queue: reports & edit suggestions
adminRoutes.get('/admin/feedback', adminOnly, async (c) => {
  const rows = await q.all(
    `SELECT f.*, u.name AS sender_name, u.email AS sender_email,
            l.title AS lecture_title, l.slug AS lecture_slug,
            e.name AS educator_name, co.name AS company_name
     FROM feedback f
     LEFT JOIN users u ON u.id = f.user_id
     LEFT JOIN lectures l ON l.id = f.lecture_id
     LEFT JOIN educators e ON e.id = f.educator_id
     LEFT JOIN companies co ON co.id = f.company_id
     ORDER BY CASE f.status WHEN 'open' THEN 0 ELSE 1 END, f.created_at DESC LIMIT 200`);
  return c.json({ feedback: rows });
});

adminRoutes.post('/admin/feedback/:id', adminOnly, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const status = ['resolved', 'dismissed', 'open'].includes(body.status) ? body.status : null;
  if (!status) return c.json({ error: 'Bad status' }, 400);
  const admin = c.get('user') || c.get('apiUser');
  await q.run(`UPDATE feedback SET status = ?, reviewer_id = ?, resolution_note = ?, reviewed_at = datetime('now') WHERE id = ?`,
    status, admin.id, String(body.note || ''), c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.get('/admin/overview', adminOnly, async (c) => {
  return c.json({
    pending: (await q.get(`SELECT COUNT(*) AS n FROM contributions WHERE status = 'pending' AND action = 'submit_lecture'`)).n,
    role_requests: (await q.get(`SELECT COUNT(*) AS n FROM contributions WHERE status = 'pending' AND action = 'request_contributor'`)).n,
    published: (await q.get(`SELECT COUNT(*) AS n FROM lectures WHERE status = 'published'`)).n,
    users: (await q.get(`SELECT COUNT(*) AS n FROM users`)).n,
    contributors: (await q.get(`SELECT COUNT(*) AS n FROM users WHERE role IN ('contributor','moderator','admin')`)).n,
    keys: (await q.get(`SELECT COUNT(*) AS n FROM api_keys WHERE status = 'active'`)).n,
    feedback_open: (await q.get(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'open'`)).n,
  });
});

adminRoutes.get('/admin/queue', adminOnly, async (c) => {
  const rows = await q.all(
    `SELECT cb.*, u.name AS submitter_name, u.email AS submitter_email FROM contributions cb
     JOIN users u ON u.id = cb.user_id WHERE cb.status = 'pending' ORDER BY cb.created_at ASC LIMIT 200`);
  return c.json({ queue: rows.map(r => ({ ...r, payload: JSON.parse(r.payload || '{}') })) });
});

async function uniqueSlug(base) {
  let slug = slugify(base), i = 2;
  while (await q.get(`SELECT id FROM lectures WHERE slug = ?`, slug)) slug = `${slugify(base)}-${i++}`;
  return slug;
}

adminRoutes.post('/admin/contributions/:id/approve', adminOnly, async (c) => {
  const admin = c.get('user') || c.get('apiUser');
  const cb = await q.get(`SELECT * FROM contributions WHERE id = ? AND status = 'pending'`, c.req.param('id'));
  if (!cb) return c.json({ error: 'Contribution not found or already reviewed' }, 404);
  const p = JSON.parse(cb.payload || '{}');
  const body = await c.req.json().catch(() => ({}));

  if (cb.action === 'request_contributor') {
    await q.run(`UPDATE users SET role = 'contributor' WHERE id = ?`, cb.user_id);
    await q.run(`UPDATE contributions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?`,
      admin.id, String(body.note || ''), cb.id);
    return c.json({ ok: true, result: 'user promoted to contributor' });
  }

  const slug = await uniqueSlug(p.title || 'untitled-lecture');
  const publicId = await nextPublicId();
  const title = p.title?.trim() || (p.educator_name ? `Untitled lecture — ${p.educator_name}` : 'Untitled lecture');
  // optional course/playlist grouping
  let courseId = null, position = null;
  if (p.course_name) {
    const cslug = slugify(p.course_name);
    let course = await q.get(`SELECT id FROM courses WHERE slug = ?`, cslug);
    if (!course) {
      course = { id: (await q.run(
        `INSERT INTO courses (slug, title, educator_id, company_id, subject, year) VALUES (?,?,?,?,?,?)`,
        cslug, p.course_name, await upsertEducator(p.educator_name), await upsertCompany(p.company_name), p.subject || '', p.year || null)).lastInsertRowid };
    }
    courseId = course.id;
    position = ((await q.get(`SELECT COUNT(*) AS n FROM lectures WHERE course_id = ?`, courseId)).n) + 1;
  }
  const info = await q.run(
    `INSERT INTO lectures (public_id, title, slug, description, educator_id, company_id, rights_holder,
       source_type, source_url, duration_sec, language, subject, tags, year, status, featured, course_id, position,
       submitted_by, reviewed_by, published_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'published', 0, ?, ?, ?, ?, datetime('now'))`,
    publicId, title, slug, p.description || '',
    await upsertEducator(p.educator_name, '', p.educator_image_url || ''),
    await upsertCompany(p.company_name, 'publisher', p.company_domain || ''),
    p.rights_holder || p.educator_name || '', p.source_type, p.source_url, p.duration_sec || 0, p.language || 'en',
    p.subject || '', JSON.stringify(p.tags || []), p.year || null, courseId, position, cb.user_id, admin.id);
  await q.run(`UPDATE lectures SET batch_name = ? WHERE id = ?`, String(p.batch_name || ''), info.lastInsertRowid);
  await q.run(`UPDATE lectures SET provider = ?, external_id = ?, access = ?, purchase_url = ?, batch_id = ?, subject_id = ?, topic_id = ? WHERE id = ?`,
    String(p.provider || ''), String(p.external_id || ''), p.access === 'paid' ? 'paid' : 'free',
    String(p.purchase_url || ''), String(p.batch_id || ''), String(p.subject_id || ''), String(p.topic_id || ''), info.lastInsertRowid);
  await q.run(`UPDATE contributions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now'), lecture_id = ? WHERE id = ?`,
    admin.id, info.lastInsertRowid, cb.id);
  return c.json({ ok: true, public_id: publicId, slug });
});

adminRoutes.post('/admin/contributions/:id/reject', adminOnly, async (c) => {
  const admin = c.get('user') || c.get('apiUser');
  const cb = await q.get(`SELECT * FROM contributions WHERE id = ? AND status = 'pending'`, c.req.param('id'));
  if (!cb) return c.json({ error: 'Contribution not found or already reviewed' }, 404);
  const body = await c.req.json().catch(() => ({}));
  await q.run(`UPDATE contributions SET status = 'rejected', reviewer_id = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?`,
    admin.id, String(body.note || ''), cb.id);
  return c.json({ ok: true });
});

adminRoutes.get('/admin/users', adminOnly, async (c) => {
  return c.json({ users: await q.all(`SELECT id, email, name, role, status, created_at FROM users ORDER BY id`) });
});

adminRoutes.post('/admin/users/:id/role', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const role = String(body.role || '');
  if (!['student', 'contributor', 'moderator', 'admin'].includes(role)) return c.json({ error: 'Bad role' }, 400);
  await q.run(`UPDATE users SET role = ? WHERE id = ?`, role, c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.post('/admin/users/:id/status', requireRole('admin'), async (c) => {
  const admin = c.get('user') || c.get('apiUser');
  const body = await c.req.json().catch(() => ({}));
  const status = String(body.status || '');
  if (!['active', 'banned'].includes(status)) return c.json({ error: 'Bad status' }, 400);
  if (Number(c.req.param('id')) === admin.id) return c.json({ error: 'You cannot ban yourself' }, 400);
  await q.run(`UPDATE users SET status = ? WHERE id = ?`, status, c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.post('/admin/lectures/:id', adminOnly, async (c) => {
  const l = await q.get(`SELECT * FROM lectures WHERE id = ?`, c.req.param('id'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const title = b.title !== undefined ? String(b.title) : l.title;
  const description = b.description !== undefined ? String(b.description) : l.description;
  const rights = b.rights_holder !== undefined ? String(b.rights_holder) : l.rights_holder;
  const status = ['published', 'rejected'].includes(b.status) ? b.status : l.status;
  await q.run(`UPDATE lectures SET title = ?, description = ?, rights_holder = ?, status = ? WHERE id = ?`,
    title, description, rights, status, l.id);
  return c.json({ ok: true });
});

adminRoutes.post('/admin/lectures/:id/feature', adminOnly, async (c) => {
  const l = await q.get(`SELECT id, featured FROM lectures WHERE id = ?`, c.req.param('id'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const on = body.featured !== undefined ? (body.featured ? 1 : 0) : (l.featured ? 0 : 1);
  await q.run(`UPDATE lectures SET featured = ? WHERE id = ?`, on, l.id);
  return c.json({ ok: true, featured: on });
});

adminRoutes.post('/admin/educators/:id', adminOnly, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const img = String(body.image_url || '').trim();
  if (img) await q.run(`UPDATE educators SET image_url = ? WHERE id = ?`, img, c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.post('/admin/companies/:id', adminOnly, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const domain = String(body.domain || '').trim();
  if (domain) await q.run(`UPDATE companies SET domain = ? WHERE id = ?`, domain, c.req.param('id'));
  return c.json({ ok: true });
});

// course management
adminRoutes.get('/admin/courses', adminOnly, async (c) => {
  const rows = await q.all(
    `SELECT co.id, co.slug, co.title, COUNT(l.id) AS lecture_count
     FROM courses co LEFT JOIN lectures l ON l.course_id = co.id
     GROUP BY co.id ORDER BY co.title LIMIT 100`);
  return c.json({ courses: rows });
});

adminRoutes.post('/admin/courses', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const title = String(b.title || '').trim();
  if (!title) return c.json({ error: 'Course title is required' }, 400);
  const slug = slugify(title);
  if (await q.get(`SELECT id FROM courses WHERE slug = ?`, slug)) return c.json({ error: 'A course with that name exists' }, 409);
  const info = await q.run(
    `INSERT INTO courses (slug, title, description, educator_id, company_id, subject, year) VALUES (?,?,?,?,?,?,?)`,
    slug, title, String(b.description || ''), await upsertEducator(b.educator_name),
    await upsertCompany(b.company_name), String(b.subject || ''), Number(b.year) || null);
  return c.json({ ok: true, id: info.lastInsertRowid, slug });
});

adminRoutes.post('/admin/courses/:id/lectures', adminOnly, async (c) => {
  const cid = c.req.param('id');
  if (!(await q.get(`SELECT id FROM courses WHERE id = ?`, cid))) return c.json({ error: 'Course not found' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const l = await q.get(`SELECT id FROM lectures WHERE public_id = ? OR slug = ?`, String(b.lecture || '').trim(), String(b.lecture || '').trim());
  if (!l) return c.json({ error: 'Lecture not found (use LC-xxxxxx id or slug)' }, 404);
  const position = Number(b.position) || ((await q.get(`SELECT COUNT(*) AS n FROM lectures WHERE course_id = ?`, cid)).n + 1);
  await q.run(`UPDATE lectures SET course_id = ?, position = ? WHERE id = ?`, cid, position, l.id);
  return c.json({ ok: true, position });
});

adminRoutes.post('/admin/courses/:id/remove-lecture', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const l = await q.get(`SELECT id FROM lectures WHERE public_id = ? OR slug = ?`, String(b.lecture || '').trim(), String(b.lecture || '').trim());
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  await q.run(`UPDATE lectures SET course_id = NULL, position = NULL WHERE id = ?`, l.id);
  return c.json({ ok: true });
});

// mark a source link dead / alive
adminRoutes.post('/admin/lectures/:id/source-status', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const status = ['ok', 'dead'].includes(b.status) ? b.status : null;
  if (!status) return c.json({ error: 'Bad status' }, 400);
  await q.run(`UPDATE lectures SET source_status = ? WHERE id = ?`, status, c.req.param('id'));
  return c.json({ ok: true, source_status: status });
});

// hide / unhide: hidden records leave the dashboard & listings, found only via search or direct link
adminRoutes.post('/admin/lectures/:id/hide', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const hidden = b.hidden ? 1 : 0;
  await q.run(`UPDATE lectures SET hidden = ?, featured = CASE WHEN ? = 1 THEN 0 ELSE featured END WHERE id = ?`, hidden, hidden, c.req.param('id'));
  return c.json({ ok: true, hidden: !!hidden });
});

adminRoutes.get('/admin/lectures', adminOnly, async (c) => {
  return c.json({ lectures: await q.all(
    `SELECT id, public_id, title, slug, featured, hidden, likes, views, status, source_status FROM lectures ORDER BY id DESC LIMIT 100`) });
});

adminRoutes.get('/admin/keys', adminOnly, async (c) => {
  const rows = await q.all(
    `SELECT k.id, k.name, k.prefix, k.scopes, k.status, k.created_at, k.last_used_at, u.email AS owner
     FROM api_keys k JOIN users u ON u.id = k.user_id ORDER BY k.id DESC LIMIT 200`);
  return c.json({ keys: rows });
});

// ---------- bulk import (PW / edtech provider format) ----------
// Mirrors the real PW API hierarchy: batch → subject → topic → video.
// POST /api/admin/import
// {
//   "provider": "pw", "company": "Physics Wallah", "company_domain": "pw.live",
//   "records": [{
//     "video_title": "...", "batch_name": "Lakshya JEE 2025",
//     "batch_id": "64b7f2c9e1a2b3c4d5e6f701",     // provider batch id (non-numeric, theirs)
//     "subject_id": "64b7f2c9e1a2b3c4d5e6f702",   // provider subject id inside the batch
//     "topic_id": "64b7f2c9e1a2b3c4d5e6f703",     // provider topic/chapter id
//     "lecture_id": "672a1b2c3d4e5f6a7b8c9d01",  // the ORIGINAL video id the company gives
//     "access": "free" | "paid", "educator": "Alakh Pandey",
//     "subject": "Physics", "duration_sec": 3600,
//     "source_url": "...", "purchase_url": "..."
//   }]
// }
adminRoutes.post('/admin/import', adminOnly, async (c) => {
  const admin = c.get('user') || c.get('apiUser');
  const b = await c.req.json().catch(() => ({}));
  const records = Array.isArray(b.records) ? b.records : [];
  if (!records.length) return c.json({ error: 'records[] is required' }, 400);
  const provider = String(b.provider || 'pw').toLowerCase();
  const companyName = String(b.company || 'Physics Wallah');
  const companyId = await upsertCompany(companyName, 'publisher', String(b.company_domain || 'pw.live'));

  let created = 0, skipped = 0, failed = 0;
  const ids = [];
  for (const r of records) {
    const title = String(r.video_title || r.title || r.name || '').trim();
    // the provider's original content id — same non-numeric id they use
    const externalId = String(r.lecture_id || r.video_id || r.videoId || r.schedule_id || r.id || r._id || r.external_id || '').trim();
    const batchId = String(r.batch_id || r.batchId || '').trim();
    const subjectId = String(r.subject_id || r.subjectId || '').trim();
    const topicId = String(r.topic_id || r.topicId || r.chapter_id || r.chapterId || '').trim();
    if (!title || !externalId) { failed++; continue; }
    const dup = await q.get(
      `SELECT id FROM lectures WHERE provider = ? AND external_id = ? AND COALESCE(batch_id,'') = ?`,
      provider, externalId, batchId);
    if (dup) { skipped++; continue; }
    const educatorName = String(r.educator || r.byName || r.educator_name || companyName);
    const url = String(r.source_url || r.url || '').trim() || `https://www.${b.company_domain || 'pw.live'}/`;
    const sourceType = /youtu/.test(url) ? 'youtube' : (r.source_type || 'stream');
    const access = r.access === 'paid' || r.paid === true ? 'paid' : 'free';
    const slug = await uniqueSlug(title);
    const publicId = await nextPublicId();
    await q.run(
      `INSERT INTO lectures (public_id, title, slug, description, educator_id, company_id, rights_holder,
         source_type, source_url, duration_sec, language, subject, tags, batch_name, provider, external_id,
         batch_id, subject_id, topic_id, access, purchase_url, year, status, featured, submitted_by, reviewed_by, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'published', 0, ?, ?, datetime('now'))`,
      publicId, title, slug, String(r.description || ''), await upsertEducator(educatorName),
      companyId, companyName, sourceType, url, Number(r.duration_sec) || 0,
      String(r.language || 'en'), String(r.subject || ''), JSON.stringify(Array.isArray(r.tags) ? r.tags : []),
      String(r.batch_name || r.batchName || r.batch || ''), provider, externalId,
      batchId, subjectId, topicId, access,
      String(r.purchase_url || ''), Number(r.year) || null, admin.id, admin.id);
    ids.push({ id: publicId, slug, batch_id: batchId, external_id: externalId });
    created++;
  }
  return c.json({ ok: true, provider, created, skipped, failed, records: ids });
});
