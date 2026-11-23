# Deploying TLDB — Cloudflare Workers (free) + D1 (free, with backups)

Everything runs on free tiers. The database is **Cloudflare D1** (SQLite at the edge) and
backups are **Time Travel**: point-in-time recovery to any minute within the last 7 days,
always on, no config, no cost — https://developers.cloudflare.com/d1/reference/time-travel/

## One-time setup

```bash
npm install -g wrangler          # Cloudflare CLI
wrangler login                   # opens browser
```

## Deploy steps

```bash
# 1. create the D1 database (free plan: 10 databases, 500 MB each, 5 GB account total)
wrangler d1 create tldb
#    → copy the database_id it prints

# 2. put the id in wrangler.jsonc  ("database_id": "xxxx-…")

# 3. create the schema on the remote D1
wrangler d1 execute tldb --remote --file=./schema.sql

# 4. deploy (serves the API from /api and /v1, and the frontend from /public as static assets)
wrangler deploy
#    → https://tldb.<your-subdomain>.workers.dev
```

## Seed the production DB (admin + starter records)

```bash
# option A: run the seed SQL through wrangler
wrangler d1 execute tldb --remote --command "INSERT INTO users (email, name, password_hash, role) VALUES ('you@example.com', 'Admin', 'REPLACE_WITH_PBKDF2_HASH', 'admin')"
#    generate a hash:  node -e "import('./server/db.js').then(async m => console.log(await m.hashPassword('your-password')))"

# option B (easier): sign up on the live site — the FIRST account becomes admin automatically.
```

## Local dev against a local D1-style DB

```bash
npm start          # runs server/node.js on http://localhost:4173 with a local libSQL file
```

The same code paths run locally and on Workers — `server/db.js` picks libSQL (file) or the
D1 binding depending on the environment.

## Backups (Time Travel)

- Always on. Restore any minute in the last 7 days (free plan):
  ```bash
  wrangler d1 time-travel tldb --remote --timestamp="2026-01-01T12:00:00Z"
  ```
- Optional extra copy: export a snapshot any time
  ```bash
  wrangler d1 export tldb --remote --output=backup-$(date +%F).sql
  ```
  (keep these in git or any cloud drive for off-site copies)

## Notes

- Admin panel lives at `#/admin` — intentionally unlinked; only admin/moderator accounts can use it.
- Public API is at `/v1/*` with `X-API-Key` headers (create keys on the site, 120 req/min each).
- Free plan limits are far beyond TLDB's needs: 100k DB writes/day, 5M reads/day, 500 MB storage
  (lecture metadata is a few KB per record).
