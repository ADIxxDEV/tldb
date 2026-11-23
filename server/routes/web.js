// Web app routes (Hono): auth, catalog, contributions, api keys, watchlist, social
'use strict';
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { q, hashPassword, verifyPassword, sha256, slugify, logView } from '../db.js';
import { createSession, destroySession, publicUser, requireRole } from '../auth.js';

export const webRoutes = new Hono();

const LECTURE_SELECT = `
  SELECT l.*, e.name AS educator_name, e.slug AS educator_slug, e.image_url AS educator_image, e.country AS educator_country,
         c.name AS company_name, c.slug AS company_slug, c.domain AS company_domain, c.country AS company_country
  FROM lectures l
  LEFT JOIN educators e ON e.id = l.educator_id
  LEFT JOIN companies c ON c.id = l.company_id`;

const WEEK_VIEWS = `(SELECT COALESCE(SUM(v.count),0) FROM view_log v WHERE v.lecture_id = l.id AND v.day >= date('now', '-7 days'))`;
const MONTH_VIEWS = `(SELECT COALESCE(SUM(v.count),0) FROM view_log v WHERE v.lecture_id = l.id AND v.day >= date('now', '-30 days'))`;
const SORTS = {
  new: `l.published_at DESC`,
  top: `(l.likes * 3 + l.views) DESC, l.published_at DESC`,
  views: `l.views DESC, l.published_at DESC`,
  trending: `${WEEK_VIEWS} DESC, l.published_at DESC`,
  month: `${MONTH_VIEWS} DESC, l.published_at DESC`,
  az: `l.title COLLATE NOCASE ASC`,
};

const LECTURE_SELECT_SCORED = `
  SELECT l.*, e.name AS educator_name, e.slug AS educator_slug, e.image_url AS educator_image, e.country AS educator_country,
         c.name AS company_name, c.slug AS company_slug, c.domain AS company_domain, c.country AS company_country,
         ${WEEK_VIEWS} AS week_views, ${MONTH_VIEWS} AS month_views
  FROM lectures l
  LEFT JOIN educators e ON e.id = l.educator_id
  LEFT JOIN companies c ON c.id = l.company_id`;

// ---------- auth ----------
webRoutes.post('/auth/signup', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { email, name, password } = b;
  if (!email || !name || !password || String(password).length < 8)
    return c.json({ error: 'Email, name and a password of 8+ characters are required' }, 400);
  if (await q.get(`SELECT id FROM users WHERE email = ?`, String(email).toLowerCase()))
    return c.json({ error: 'That email is already registered' }, 409);
  const isFirst = !(await q.get(`SELECT id FROM users LIMIT 1`));
  const role = isFirst ? 'admin' : 'student';
  const info = await q.run(`INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?)`,
    String(email).toLowerCase(), String(name), await hashPassword(String(password)), role);
  const token = await createSession(info.lastInsertRowid);
  setCookie(c, 'tldb_session', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 30 * 86400 });
  return c.json({ user: publicUser(await q.get(`SELECT * FROM users WHERE id = ?`, info.lastInsertRowid)) });
});

webRoutes.post('/auth/login', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = await q.get(`SELECT * FROM users WHERE email = ?`, String(b.email || '').toLowerCase());
  if (!u || !(await verifyPassword(String(b.password || ''), u.password_hash)))
    return c.json({ error: 'Wrong email or password' }, 401);
  if (u.status !== 'active') return c.json({ error: 'Account is banned' }, 403);
  const token = await createSession(u.id);
  setCookie(c, 'tldb_session', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 30 * 86400 });
  return c.json({ user: publicUser(u) });
});

webRoutes.post('/auth/change-password', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  const current = String(b.current || ''), next = String(b.next || '');
  if (next.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);
  const row = await q.get(`SELECT password_hash FROM users WHERE id = ?`, user.id);
  if (!(await verifyPassword(current, row.password_hash))) return c.json({ error: 'Current password is wrong' }, 403);
  await q.run(`UPDATE users SET password_hash = ? WHERE id = ?`, await hashPassword(next), user.id);
  await q.run(`DELETE FROM sessions WHERE user_id = ? AND token != ?`, user.id, c.get('sessionToken') || '');
  return c.json({ ok: true, message: 'Password changed — other sessions signed out' });
});

webRoutes.post('/auth/logout', async (c) => {
  await destroySession(c.get('sessionToken'));
  deleteCookie(c, 'tldb_session', { path: '/' });
  return c.json({ ok: true });
});

webRoutes.get('/auth/me', (c) => c.json({ user: publicUser(c.get('user')) }));

webRoutes.post('/auth/request-contributor', requireRole('student', 'contributor'), async (c) => {
  const user = c.get('user');
  if (user.role === 'contributor') return c.json({ ok: true, status: 'already contributor' });
  const b = await c.req.json().catch(() => ({}));
  await q.run(`INSERT INTO contributions (user_id, action, payload) VALUES (?,?,?)`,
    user.id, 'request_contributor', JSON.stringify({ note: String(b.note || '') }));
  return c.json({ ok: true, status: 'request sent, an admin will review it' });
});

// ---------- home page aggregate ----------
webRoutes.get('/home', async (c) => {
  const featured = await q.all(`${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 AND l.featured = 1 ORDER BY l.published_at DESC LIMIT 3`);
  const week = await q.all(
    `SELECT l.id, SUM(v.count) AS week_views FROM view_log v JOIN lectures l ON l.id = v.lecture_id
     WHERE v.day >= date('now', '-7 days') AND l.status = 'published' GROUP BY l.id ORDER BY week_views DESC LIMIT 8`);
  let trending = [];
  if (week.length) {
    const ids = week.map(w => w.id);
    const rows = await q.all(`${LECTURE_SELECT} WHERE l.id IN (${ids.map(() => '?').join(',')})`, ...ids);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    trending = week.map(w => ({ ...byId[w.id], week_views: w.week_views })).filter(r => r.id);
  }
  const top = await q.all(`${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 ORDER BY (l.likes * 3 + l.views) DESC, l.published_at DESC LIMIT 8`);
  const recent = await q.all(`${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 ORDER BY l.published_at DESC LIMIT 8`);
  const educators = await q.all(
    `SELECT e.slug, e.name, e.image_url, COUNT(l.id) AS lectures, COALESCE(SUM(l.likes),0) AS likes
     FROM educators e JOIN lectures l ON l.educator_id = e.id AND l.status = 'published'
     GROUP BY e.id ORDER BY likes DESC, lectures DESC LIMIT 12`);
  const companies = await q.all(
    `SELECT c.slug, c.name, c.kind, c.domain, c.country, c.url, COUNT(l.id) AS lectures
     FROM companies c JOIN lectures l ON l.company_id = c.id AND l.status = 'published'
     GROUP BY c.id ORDER BY lectures DESC, c.name LIMIT 12`);
  const monthTop = await q.all(
    `${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 ORDER BY ${MONTH_VIEWS} DESC, (l.likes * 3 + l.views) DESC LIMIT 8`);
  const courses = await q.all(
    `SELECT co.id, co.slug, co.title, co.year, e.name AS educator_name,
            COUNT(l.id) AS lecture_count
     FROM courses co
     LEFT JOIN educators e ON e.id = co.educator_id
     LEFT JOIN lectures l ON l.course_id = co.id AND l.status = 'published'
     GROUP BY co.id HAVING lecture_count > 0 ORDER BY lecture_count DESC LIMIT 12`);
  const subjects = await q.all(
    `SELECT subject, COUNT(*) AS count FROM lectures WHERE status = 'published' AND subject != ''
     GROUP BY subject ORDER BY count DESC LIMIT 12`);
  const countries = await q.all(
    `SELECT DISTINCT country FROM (SELECT country FROM educators WHERE country != '' UNION SELECT country FROM companies WHERE country != '') ORDER BY country`);
  const total = (await q.get(`SELECT COUNT(*) AS n FROM lectures WHERE status = 'published' AND hidden = 0`)).n;
  const educatorCount = (await q.get(`SELECT COUNT(*) AS n FROM educators`)).n;
  const companyCount = (await q.get(`SELECT COUNT(*) AS n FROM companies`)).n;
  return c.json({ featured, trending, monthTop, top, recent, educators, companies, courses, subjects, countries,
    stats: { total, educators: educatorCount, companies: companyCount } });
});

// ---------- catalog (public read) ----------
webRoutes.get('/lectures', async (c) => {
  const query = c.req.query('query') || '', subject = c.req.query('subject') || '';
  const educator = c.req.query('educator') || '', source = c.req.query('source') || '';
  const country = c.req.query('country') || '', language = c.req.query('language') || '';
  const batch = c.req.query('batch') || '';
  const sort = SORTS[c.req.query('sort')] ? c.req.query('sort') : 'new';
  const page = Number(c.req.query('page')) || 1;
  const where = [`l.status = 'published'`];
  const params = [];
  // hidden records stay off the listings — they only surface when actively searched
  if (!query) where.push(`l.hidden = 0`);
  if (query) { where.push(`(l.title LIKE ? OR l.description LIKE ? OR l.tags LIKE ? OR l.batch_name LIKE ?)`); const like = `%${query}%`; params.push(like, like, like, like); }
  if (subject) { where.push(`l.subject LIKE ?`); params.push(`%${subject}%`); }
  if (source) { where.push(`l.source_type = ?`); params.push(source); }
  if (educator) { where.push(`e.slug = ?`); params.push(educator); }
  if (country) { where.push(`(e.country = ? OR c.country = ?)`); params.push(country, country); }
  if (language) { where.push(`l.language = ?`); params.push(language); }
  if (batch) { where.push(`l.batch_name = ?`); params.push(batch); }
  const w = where.join(' AND ');
  const per = 24;
  const rows = await q.all(
    `${LECTURE_SELECT_SCORED} WHERE ${w} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`, ...params, per, (page - 1) * per);
  const { n } = await q.get(`SELECT COUNT(*) AS n FROM lectures l LEFT JOIN educators e ON e.id = l.educator_id LEFT JOIN companies c ON c.id = l.company_id WHERE ${w}`, ...params);
  return c.json({ lectures: rows, total: n, page, pages: Math.max(1, Math.ceil(n / per)), sort });
});

// filter metadata for the browse bar
webRoutes.get('/meta', async (c) => {
  const countries = await q.all(`SELECT DISTINCT country FROM (SELECT country FROM educators WHERE country != '' UNION SELECT country FROM companies WHERE country != '') ORDER BY country`);
  const languages = await q.all(`SELECT language, COUNT(*) AS count FROM lectures WHERE status = 'published' AND hidden = 0 GROUP BY language ORDER BY count DESC`);
  const batches = await q.all(`SELECT batch_name, COUNT(*) AS count FROM lectures WHERE status = 'published' AND hidden = 0 AND batch_name != '' GROUP BY batch_name ORDER BY count DESC LIMIT 50`);
  const subjects = await q.all(`SELECT subject, COUNT(*) AS count FROM lectures WHERE status = 'published' AND hidden = 0 AND subject != '' GROUP BY subject ORDER BY count DESC`);
  return c.json({ countries: countries.map(r => r.country), languages, batches, subjects });
});

webRoutes.get('/lectures/:slug', async (c) => {
  const l = await q.get(`${LECTURE_SELECT} WHERE l.slug = ? AND l.status = 'published'`, c.req.param('slug'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  await q.run(`UPDATE lectures SET views = views + 1 WHERE id = ?`, l.id);
  await logView(l.id);
  const comments = await q.all(
    `SELECT cm.id, cm.body, cm.created_at, u.name AS author FROM comments cm JOIN users u ON u.id = cm.user_id
     WHERE cm.lecture_id = ? ORDER BY cm.created_at DESC`, l.id);
  const course = l.course_id ? await q.get(`SELECT slug, title FROM courses WHERE id = ?`, l.course_id) : null;
  // related: same educator first, then same subject, exclude self
  const related = await q.all(
    `${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 AND l.id != ?
       AND (l.educator_id = ? OR (l.subject != '' AND l.subject = ?))
     ORDER BY (l.educator_id = ?) DESC, l.published_at DESC LIMIT 6`,
    l.id, l.educator_id || -1, l.subject || '\u0000', l.educator_id || -1);
  const user = c.get('user');
  const myVote = user ? ((await q.get(`SELECT value FROM votes WHERE lecture_id = ? AND user_id = ?`, l.id, user.id))?.value ?? 0) : 0;
  const saved = user ? !!(await q.get(`SELECT id FROM watchlist WHERE lecture_id = ? AND user_id = ?`, l.id, user.id)) : false;
  return c.json({ lecture: { ...l, tags: JSON.parse(l.tags || '[]') }, comments, myVote, saved, course, related });
});

webRoutes.post('/lectures/:slug/vote', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const l = await q.get(`SELECT * FROM lectures WHERE slug = ? AND status = 'published'`, c.req.param('slug'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const n = Number(body.value);
  const v = n > 0 ? 1 : n < 0 ? -1 : 0;
  const prev = await q.get(`SELECT id, value FROM votes WHERE lecture_id = ? AND user_id = ?`, l.id, user.id);
  if (prev) {
    if (v === prev.value || v === 0) {
      await q.run(`DELETE FROM votes WHERE id = ?`, prev.id);
      await q.run(`UPDATE lectures SET likes = likes - ?, dislikes = dislikes - ? WHERE id = ?`,
        prev.value === 1 ? 1 : 0, prev.value === -1 ? 1 : 0, l.id);
    } else {
      await q.run(`UPDATE votes SET value = ? WHERE id = ?`, v, prev.id);
      await q.run(`UPDATE lectures SET likes = likes + ?, dislikes = dislikes - ? WHERE id = ?`, v === 1 ? 1 : 0, prev.value === -1 ? 1 : 0, l.id);
      await q.run(`UPDATE lectures SET likes = likes - ?, dislikes = dislikes + ? WHERE id = ?`, prev.value === 1 ? 1 : 0, v === -1 ? 1 : 0, l.id);
    }
  } else if (v !== 0) {
    await q.run(`INSERT INTO votes (lecture_id, user_id, value) VALUES (?,?,?)`, l.id, user.id, v);
    await q.run(`UPDATE lectures SET likes = likes + ?, dislikes = dislikes + ? WHERE id = ?`, v === 1 ? 1 : 0, v === -1 ? 1 : 0, l.id);
  }
  return c.json(await q.get(`SELECT likes, dislikes FROM lectures WHERE id = ?`, l.id));
});

webRoutes.post('/lectures/:slug/comments', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const l = await q.get(`SELECT id FROM lectures WHERE slug = ? AND status = 'published'`, c.req.param('slug'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.body || '').trim();
  if (!text || text.length > 2000) return c.json({ error: 'Comment must be 1–2000 characters' }, 400);
  await q.run(`INSERT INTO comments (lecture_id, user_id, body) VALUES (?,?,?)`, l.id, user.id, text);
  return c.json({ ok: true });
});

// ---------- watchlist ----------
webRoutes.post('/lectures/:slug/save', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const l = await q.get(`SELECT id FROM lectures WHERE slug = ? AND status = 'published'`, c.req.param('slug'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  const existing = await q.get(`SELECT id FROM watchlist WHERE lecture_id = ? AND user_id = ?`, l.id, user.id);
  if (existing) {
    await q.run(`DELETE FROM watchlist WHERE id = ?`, existing.id);
    return c.json({ saved: false });
  }
  await q.run(`INSERT INTO watchlist (lecture_id, user_id) VALUES (?,?)`, l.id, user.id);
  return c.json({ saved: true });
});

webRoutes.get('/watchlist', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const rows = await q.all(
    `${LECTURE_SELECT} JOIN watchlist w ON w.lecture_id = l.id
     WHERE w.user_id = ? AND l.status = 'published' ORDER BY w.created_at DESC`, user.id);
  return c.json({ lectures: rows });
});

webRoutes.get('/courses', async (c) => {
  const rows = await q.all(
    `SELECT co.id, co.slug, co.title, co.description, co.subject, co.year,
            e.name AS educator_name, e.slug AS educator_slug, e.image_url AS educator_image,
            c.name AS company_name, c.domain AS company_domain,
            COUNT(l.id) AS lecture_count
     FROM courses co
     LEFT JOIN educators e ON e.id = co.educator_id
     LEFT JOIN companies c ON c.id = co.company_id
     LEFT JOIN lectures l ON l.course_id = co.id AND l.status = 'published'
     GROUP BY co.id ORDER BY lecture_count DESC, co.title LIMIT 100`);
  return c.json({ courses: rows });
});

webRoutes.get('/courses/:slug', async (c) => {
  const co = await q.get(
    `SELECT co.*, e.name AS educator_name, e.slug AS educator_slug, e.image_url AS educator_image,
            c.name AS company_name, c.domain AS company_domain
     FROM courses co
     LEFT JOIN educators e ON e.id = co.educator_id
     LEFT JOIN companies c ON c.id = co.company_id
     WHERE co.slug = ?`, c.req.param('slug'));
  if (!co) return c.json({ error: 'Course not found' }, 404);
  const lectures = await q.all(
    `${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 AND l.course_id = ? ORDER BY COALESCE(l.position, 9999), l.published_at`, co.id);
  return c.json({ course: co, lectures });
});

// ---------- feedback: report issues / suggest edits ----------
// shared handler used by both the web UI (/api) and the keyed API (/v1)
export async function submitFeedback(c) {
  const user = c.get('user') || c.get('apiUser');
  if (!user) return c.json({ error: 'Sign in required' }, 401);
  const b = await c.req.json().catch(() => ({}));
  const message = String(b.message || '').trim();
  const type = ['report', 'edit', 'other'].includes(b.type) ? b.type : 'report';
  if (message.length < 5 || message.length > 2000) return c.json({ error: 'Message must be 5–2000 characters' }, 400);
  let lecture_id = null, educator_id = null, company_id = null;
  if (b.lecture_slug) lecture_id = (await q.get(`SELECT id FROM lectures WHERE slug = ?`, b.lecture_slug))?.id ?? null;
  if (b.educator_slug) educator_id = (await q.get(`SELECT id FROM educators WHERE slug = ?`, b.educator_slug))?.id ?? null;
  if (b.company_slug) company_id = (await q.get(`SELECT id FROM companies WHERE slug = ?`, b.company_slug))?.id ?? null;
  await q.run(`INSERT INTO feedback (user_id, lecture_id, educator_id, company_id, type, message) VALUES (?,?,?,?,?,?)`,
    user.id, lecture_id, educator_id, company_id, type, message);
  return c.json({ ok: true, status: 'Thanks — an admin will review it.' });
}
webRoutes.post('/feedback', submitFeedback);

// ---------- educators & companies (public pages) ----------
webRoutes.get('/educators/:slug', async (c) => {
  const e = await q.get(`SELECT * FROM educators WHERE slug = ?`, c.req.param('slug'));
  if (!e) return c.json({ error: 'Educator not found' }, 404);
  const lectures = await q.all(`${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 AND l.educator_id = ? ORDER BY l.published_at DESC`, e.id);
  return c.json({ educator: e, lectures });
});

webRoutes.get('/companies/:slug', async (c) => {
  const co = await q.get(`SELECT * FROM companies WHERE slug = ?`, c.req.param('slug'));
  if (!co) return c.json({ error: 'Company not found' }, 404);
  const lectures = await q.all(`${LECTURE_SELECT} WHERE l.status = 'published' AND l.hidden = 0 AND l.company_id = ? ORDER BY l.published_at DESC`, co.id);
  return c.json({ company: co, lectures });
});

// ---------- contribution panel ----------
const SOURCE_TYPES = ['youtube', 'archive', 'torrent', 'file', 'stream', 'other'];

// shared handler used by both the web UI (/api) and the keyed API (/v1)
export async function submitContribution(c) {
  const user = c.get('user') || c.get('apiUser');
  if (!user) return c.json({ error: 'Sign in required' }, 401);
  const b = await c.req.json().catch(() => ({}));
  const errs = [];
  if (!String(b.title || '').trim() && !String(b.educator_name || '').trim()) errs.push('give the lecture a title or at least an educator name');
  if (!String(b.source_url || '').trim()) errs.push('source_url is required');
  if (!SOURCE_TYPES.includes(b.source_type)) errs.push(`source_type must be one of: ${SOURCE_TYPES.join(', ')}`);
  if (errs.length) return c.json({ error: errs.join('; ') }, 400);

  const payload = {
    title: String(b.title || '').trim(),   // optional — auto-named if empty
    description: String(b.description || '').trim(),
    educator_name: String(b.educator_name || '').trim(),
    educator_image_url: String(b.educator_image_url || '').trim(),
    company_name: String(b.company_name || '').trim(),
    company_domain: String(b.company_domain || '').trim(),
    course_name: String(b.course_name || '').trim(),   // optional playlist/course grouping
    batch_name: String(b.batch_name || '').trim(),     // original batch/cohort label
    rights_holder: String(b.rights_holder || '').trim(),
    source_type: b.source_type,
    source_url: String(b.source_url).trim(),
    duration_sec: Number(b.duration_sec) || 0,
    language: String(b.language || 'en').trim(),
    subject: String(b.subject || '').trim(),
    tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 10) : [],
    year: Number(b.year) || null,
  };
  const info = await q.run(`INSERT INTO contributions (user_id, action, payload) VALUES (?,?,?)`,
    user.id, 'submit_lecture', JSON.stringify(payload));
  return c.json({ ok: true, contribution_id: info.lastInsertRowid, status: 'pending' });
}
webRoutes.post('/contributions', submitContribution);

webRoutes.get('/contributions/mine', requireRole('contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const rows = await q.all(
    `SELECT cb.*, l.public_id, l.slug AS lecture_slug FROM contributions cb
     LEFT JOIN lectures l ON l.id = cb.lecture_id
     WHERE cb.user_id = ? ORDER BY cb.created_at DESC LIMIT 100`, user.id);
  return c.json({ contributions: rows });
});

// ---------- API keys ----------
async function newApiKey(userId, name, scopes) {
  const key = 'tldb_' + crypto.randomBytes(24).toString('base64url');
  await q.run(`INSERT INTO api_keys (user_id, name, prefix, key_hash, scopes) VALUES (?,?,?,?,?)`,
    userId, String(name).slice(0, 60), key.slice(0, 12), await sha256(key), scopes);
  return key;
}

webRoutes.get('/keys', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const rows = await q.all(`SELECT id, name, prefix, scopes, status, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY id DESC`, user.id);
  return c.json({ keys: rows });
});

webRoutes.post('/keys', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (!name) return c.json({ error: 'Give the key a name' }, 400);
  const scopes = user.role === 'admin' ? 'read,write,admin' : user.role === 'student' ? 'read' : 'read,write';
  const key = await newApiKey(user.id, name, scopes);
  return c.json({ key, note: 'Copy it now — it is stored hashed and cannot be shown again.' });
});

webRoutes.delete('/keys/:id', requireRole('student', 'contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user');
  await q.run(`UPDATE api_keys SET status = 'revoked' WHERE id = ? AND user_id = ?`, c.req.param('id'), user.id);
  return c.json({ ok: true });
});
