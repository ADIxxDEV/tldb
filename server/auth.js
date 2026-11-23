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
    let user = c.get('user');
    if (!user) {
      // API key path: the key must carry the right scope for the action class.
      const apiUser = c.get('apiUser');
      if (apiUser) {
        const scopes = String(c.get('apiKey')?.scopes || 'read').split(',');
        const needsAdmin = roles.includes('admin') || roles.includes('moderator');
        const needs = needsAdmin ? 'admin' : 'write';
        if (scopes.includes(needs)) user = apiUser;
      }
    }
    if (!user) return c.json({ error: 'Sign in required' }, 401);
    if (!roles.includes(user.role)) return c.json({ error: 'Not allowed for your role' }, 403);
    c.set('actor', user); // the effective user (session or key owner)
    await next();
  };
}

// Require a valid API key for a route (used to gate /v1/* mounts)
export function requireApiKey() {
  return async (c, next) => {
    if (!c.get('apiKey')) {
      return c.json({ error: 'Valid X-API-Key header required. Create one in the TLDB developer panel.' }, 401);
    }
    await next();
  };
}

// Fixed-window rate limiter. On Workers uses native rate-limit bindings
// (accurate across isolates; the binding's configured limit applies).
// Falls back to in-memory counting on Node (single process).
export function rateLimit(max = 120, windowSec = 60, bucket = 'general', bindingName = null) {
  const hits = new Map();
  return async (c, next) => {
    const id = c.get('apiKey')?.id || c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'anon';
    const rl = bindingName ? c.env?.[bindingName] : null;
    if (rl?.limit) {
      const r = await rl.limit({ key: `${bucket}:${id}` });
      if (!r?.success) return c.json({ error: 'Rate limit exceeded — slow down' }, 429);
      await next();
      return;
    }
    const now = Date.now();
    const w = Math.floor(now / (windowSec * 1000));
    const rec = hits.get(id);
    if (!rec || rec.window !== w) hits.set(id, { window: w, count: 1 });
    else rec.count++;
    if (hits.size > 5000) hits.clear();
    if (hits.get(id).count > max) return c.json({ error: 'Rate limit exceeded — slow down' }, 429);
    await next();
  };
}
