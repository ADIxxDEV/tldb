// Public v1 API — keyed, rate-limited read API (Hono)
'use strict';
import { Hono } from 'hono';
import { q } from '../db.js';
import { rateLimit } from '../auth.js';

export const v1Routes = new Hono();

// rate limit: 120 req/min per key — native binding on Workers, in-memory on Node
v1Routes.use('*', rateLimit(120, 60, 'v1', 'RL_V1'));

v1Routes.use('*', async (c, next) => {
  const key = c.get('apiKey');
  const user = c.get('apiUser');
  if (!key || !user) return c.json({ error: 'Valid X-API-Key header required. Create one in the TLDB developer panel.' }, 401);
  await next();
});

const SELECT = `
  SELECT l.public_id, l.title, l.slug, l.description, l.source_type, l.source_url,
         l.duration_sec, l.language, l.subject, l.tags, l.year, l.likes, l.dislikes, l.views, l.hidden,
         l.published_at, e.name AS educator, e.slug AS educator_slug,
         c.name AS company, c.slug AS company_slug, l.rights_holder
  FROM lectures l
  LEFT JOIN educators e ON e.id = l.educator_id
  LEFT JOIN companies c ON c.id = l.company_id`;

v1Routes.get('/lectures', async (c) => {
  const query = c.req.query('query') || '', subject = c.req.query('subject') || '';
  const educator = c.req.query('educator') || '', source = c.req.query('source') || '';
  const page = Math.max(Number(c.req.query('page')) || 1, 1);
  const limit = Math.min(Math.max(Number(c.req.query('per')) || 50, 1), 100);
  const where = [`l.status = 'published'`];
  const params = [];
  // hidden records stay off the public API listings — they surface only via search
  if (!query) where.push(`l.hidden = 0`);
  if (query) { where.push(`(l.title LIKE ? OR l.description LIKE ? OR l.tags LIKE ?)`); const like = `%${query}%`; params.push(like, like, like); }
  if (subject) { where.push(`l.subject LIKE ?`); params.push(`%${subject}%`); }
  if (source) { where.push(`l.source_type = ?`); params.push(source); }
  if (educator) { where.push(`e.slug = ?`); params.push(educator); }
  const w = where.join(' AND ');
  const rows = await q.all(`${SELECT} WHERE ${w} ORDER BY l.published_at DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const { n } = await q.get(`SELECT COUNT(*) AS n FROM lectures l LEFT JOIN educators e ON e.id = l.educator_id WHERE ${w}`, ...params);
  return c.json({ data: rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })), meta: { total: n, page, per_page: limit } });
});

v1Routes.get('/lectures/:publicId', async (c) => {
  const l = await q.get(`${SELECT} WHERE l.public_id = ? AND l.status = 'published'`, c.req.param('publicId'));
  if (!l) return c.json({ error: 'Lecture not found' }, 404);
  return c.json({ data: { ...l, tags: JSON.parse(l.tags || '[]') } });
});

v1Routes.get('/educators', async (c) => {
  return c.json({ data: await q.all(`SELECT e.id, e.slug, e.name, e.bio, e.url, e.image_url, COUNT(l.id) AS lecture_count
    FROM educators e LEFT JOIN lectures l ON l.educator_id = e.id AND l.status = 'published'
    GROUP BY e.id ORDER BY lecture_count DESC, e.name LIMIT 200`) });
});

v1Routes.get('/companies', async (c) => {
  return c.json({ data: await q.all(`SELECT c.id, c.slug, c.name, c.kind, c.url, c.domain, COUNT(l.id) AS lecture_count
    FROM companies c LEFT JOIN lectures l ON l.company_id = c.id AND l.status = 'published'
    GROUP BY c.id ORDER BY lecture_count DESC, c.name LIMIT 200`) });
});
