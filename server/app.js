// TLDB app builder — one Hono app for Node (local) and Cloudflare Workers (prod)
'use strict';
import { Hono } from 'hono';
import { attachAuth } from './auth.js';
import { webRoutes } from './routes/web.js';
import { adminRoutes } from './routes/admin.js';
import { v1Routes } from './routes/v1.js';

export function buildApp() {
  const app = new Hono();

  app.use('/api/*', attachAuth);
  app.use('/v1/*', attachAuth);

  app.route('/api', webRoutes);
  app.route('/api', adminRoutes);
  app.route('/v1', v1Routes);

  app.get('/api/health', (c) => c.json({ ok: true, service: 'tldb', time: new Date().toISOString() }));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Something went wrong on our side' }, 500);
  });

  return app;
}
