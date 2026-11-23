// Node entry — local dev / self-hosting. On Cloudflare Workers use worker/entry.js instead.
'use strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { setupDb, ensureSchema } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 4173;

await setupDb();
await ensureSchema();

const app = buildApp();

// static frontend + SPA fallback
app.use('*', serveStatic({ root: './public' }));
app.get('*', (c) => {
  try { return c.html(readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8')); }
  catch { return c.text('Not found', 404); }
});

serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`TLDB running → http://localhost:${PORT}  (db: ${process.env.TLDB_DB || 'file:tldb.db'})`));
