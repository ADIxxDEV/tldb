// TLDB app builder — one Hono app for Node (local) and Cloudflare Workers (prod)
'use strict';
import { Hono } from 'hono';
import { attachAuth, requireApiKey, rateLimit } from './auth.js';
import { turnstileConfig } from './antibot.js';
import { webRoutes } from './routes/web.js';
import { adminRoutes } from './routes/admin.js';
import { v1Routes } from './routes/v1.js';
import { writeRoutes } from './routes/write.js';
import { batchRoutes } from './routes/batches.js';

export function buildApp() {
  const app = new Hono();

  // expose Turnstile config + IP-based abuse limits
  app.use('*', async (c, next) => {
    c.env = c.env || {};
    if (!c.env.turnstile) c.env.turnstile = turnstileConfig(Object.keys(c.env).length ? c.env : process.env);
    await next();
  });
  app.use('/api/*', rateLimit(300, 60, 'api', 'RL_API'));   // scrape protection: 300 req/min per IP
  app.use('/api/auth/*', rateLimit(10, 60, 'auth', 'RL_AUTH')); // brute-force protection: 10 auth tries/min per IP

  app.use('/api/*', attachAuth);
  app.use('/v1/*', attachAuth);

  app.route('/api', webRoutes);
  app.route('/api', batchRoutes);
  app.route('/api', adminRoutes);
  app.route('/v1', v1Routes);

  // keyed write + admin API: same handlers, scoped API keys instead of cookies
  app.use('/v1/*', requireApiKey());
  app.use('/v1/*', rateLimit(120, 60));
  app.route('/v1', writeRoutes);
  app.route('/v1', adminRoutes);
  app.route('/v1', batchRoutes);

  app.get('/api/health', (c) => c.json({ ok: true, service: 'tldb', time: new Date().toISOString() }));

  // auth page config: which human-verification widget to render
  app.get('/api/auth/config', (c) => {
    const t = c.env.turnstile;
    return c.json({ turnstile: t.enabled ? { site_key: t.siteKey } : null });
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Something went wrong on our side' }, 500);
  });

  return app;
}
