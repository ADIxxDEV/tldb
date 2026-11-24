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

## CI/CD (GitHub Actions)
- **CI** (`.github/workflows/ci.yml`): on every push/PR — syntax-checks all JS and runs the API test suite (`npm test`). Tests must pass.
- **Deploy** (`.github/workflows/deploy.yml`): only runs when CI passed on `main` → deploys with wrangler → **smoke-checks production** (health, home, catalog, meta, keyed-API 401). Red workflow = broken production.
- One-time setup: add two repo secrets (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN` — create at dash.cloudflare.com → My Profile → API Tokens with **Workers Scripts: Edit** + **D1: Edit** permissions
  - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard right sidebar
- After that, every push to `main` tests → deploys → verifies itself.

## Turnstile (human verification)
- Login and signup are protected by Cloudflare Turnstile.
- Without keys, official TEST keys are used (widget hidden, always passes) — fine for local dev.
- To enforce for real: create a widget (dash.cloudflare.com → Turnstile), put `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` in `wrangler.jsonc` `vars` (or as Workers secrets), redeploy.

## Anti-abuse
- Disposable/temp email domains are rejected at signup (curated blocklist + heuristics in `server/antibot.js`).
- IP rate limits: 300 req/min on `/api/*`, 10 tries/min on `/api/auth/*` (brute-force), 120 req/min on the keyed `/v1/*`.

## Provider formats (PW / Physics Wallah and friends)
Records carry the fields an edtech catalogue actually uses:

| field | meaning |
|---|---|
| `title` | video title |
| `batch_name` | batch / course name (e.g. "Lakshya JEE 2025") |
| `provider` | platform key — `pw`, `unacademy`, `youtube`, … |
| `external_id` | the provider's own **non-numeric** content/lecture id — the same id the company uses |
| `access` | `free` or `paid` |
| `purchase_url` | official purchase page (required for paid) |
| `educator` | teacher name |

**Bulk import (admin only):** `POST /api/admin/import` with
`{ "provider": "pw", "company": "Physics Wallah", "company_domain": "pw.live", "records": [ … ] }`
Records are de-duplicated on `provider + external_id`, so re-running an import is safe.

CLI helper: `node scripts/import-pw.js [base-url] [admin-email] [password] [file]`
Sample + full format: `data/pw-sample.json`.

Physics Wallah is seeded as a rights-holder company (pw.live) with three records in this format
(two paid batch lectures, one free crash lecture).
