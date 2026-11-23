// Auth: cookie sessions + API key auth (Hono middleware)
'use strict';
import crypto from 'node:crypto';
import { getCookie } from 'hono/cookie';
import { q, sha256 } from './db.js';

const SESSION_DAYS = 30;

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await q.run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)`, token, userId, expires);
  return token;
}

export async function destroySession(token) {
  if (token) await q.run(`DELETE FROM sessions WHERE token = ?`, token);
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status };
}

// attaches c.get('user') (cookie session) or c.get('apiUser')/c.get('apiKey') (X-API-Key)
export async function attachAuth(c, next) {
  const token = getCookie(c, 'tldb_session');
  if (token) {
    const row = await q.get(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.status = 'active'`, token);
    if (row) { c.set('user', row); c.set('sessionToken', token); }
  }
  const key = c.req.header('X-API-Key');
  if (key) {
    const k = await q.get(`SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'`, await sha256(key));
    if (k) {
      await q.run(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`, k.id);
      const u = await q.get(`SELECT * FROM users WHERE id = ? AND status = 'active'`, k.user_id);
      if (u) { c.set('apiKey', k); c.set('apiUser', u); }
    }
  }
  await next();
}

export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Sign in required' }, 401);
    if (!roles.includes(user.role)) return c.json({ error: 'Not allowed for your role' }, 403);
    await next();
  };
}
