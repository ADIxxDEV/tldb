// Cloudflare Workers entry — TLDB on Workers Free + D1 (Time Travel backups included)
'use strict';
import { buildApp } from '../server/app.js';
import { setupDb, ensureSchema } from '../server/db.js';

const app = buildApp();

export default {
  async fetch(request, env, ctx) {
    setupDb({ d1: env.TLDB_DB });
    await ensureSchema();
    return app.fetch(request, env, ctx);
  },
};
