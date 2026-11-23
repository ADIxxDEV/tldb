// Keyed write API — submit contributions & feedback with an X-API-Key (scope: write)
'use strict';
import { Hono } from 'hono';
import { q } from '../db.js';
import { requireRole } from '../auth.js';
import { submitContribution, submitFeedback } from './web.js';

export const writeRoutes = new Hono();

// POST /v1/lectures — submit a lecture for review (needs scope: write)
writeRoutes.post('/lectures', requireRole('contributor', 'moderator', 'admin'), submitContribution);

// POST /v1/feedback — file feedback / dead-link report (any valid key)
writeRoutes.post('/feedback', submitFeedback);

// GET /v1/contributions/mine — your own submissions + their status
writeRoutes.get('/contributions/mine', requireRole('contributor', 'moderator', 'admin'), async (c) => {
  const user = c.get('user') || c.get('apiUser');
  const rows = await q.all(
    `SELECT cb.*, l.public_id, l.slug AS lecture_slug FROM contributions cb
     LEFT JOIN lectures l ON l.id = cb.lecture_id
     WHERE cb.user_id = ? ORDER BY cb.created_at DESC LIMIT 100`, user.id);
  return c.json({ data: rows });
});
