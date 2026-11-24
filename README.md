# TLDB — The Lecture Database

The "IMDb of lectures": an open, curated record of lectures and educational material.
TLDB stores **metadata + pointers only** — nothing is hosted here. Every record points to
the source (YouTube, Internet Archive, torrent/magnet, direct file, HLS/DASH stream).

## Stack
- **Hono** — one codebase runs on Node (local) and Cloudflare Workers (prod)
- **Database**: local libSQL file in dev; **Cloudflare D1** in prod (free tier)
  - backups: **D1 Time Travel** — point-in-time recovery, last 7 days, always on, free
- Frontend: dependency-free SPA (hash routing) served as static assets
- Auth: PBKDF2 password hashing, httpOnly cookie sessions

## Run locally
```bash
npm install
npm run seed     # creates the admin account + Physics Wallah as the rights holder (no lectures)
npm start        # → http://localhost:4173
```

First account created becomes **admin**. Seed admin: `admin@tldb.local` / `changeme123` (change it on `#/account`).

The catalog starts **empty on purpose** — fill it with the admin import API (`docs/AI-IMPORT.md`),
the contribute form, or the admin panel's import box.

## Deploy (free)
See **DEPLOY.md** — Cloudflare Workers + D1, ~5 commands, $0/month.

## Features
- Catalog: lectures with educator, company/rights holder, source type & URL, subject, tags, year
- Home page: featured picks, trending this week (real view tracking), top rated,
  top educators (portrait from URL, monogram fallback), company logos (favicon by domain),
  subject browse — no lecture thumbnails by design
- Educator & company pages (IMDb name/title-page style)
- Watchlist ("My list"), votes, comments
- Contribution flow: students request contributor access → admin approves → submissions
  enter a review queue → admin publishes (assigns `LC-0000xx` public ID)
- Admin panel at `#/admin` (unlinked by design): queue, users, roles, bans, feature picks, keys
- Developer panel: API keys (hashed, shown once, revocable)

## Roles
| Role | Can do |
|---|---|
| student | browse, vote, comment, save to list, read-only API keys |
| contributor | + submit lectures to the review queue |
| moderator | + approve/reject the queue |
| admin | + manage users, roles, bans, featured picks |

## API
Internal (cookie session): `/api/…` — auth, catalog, contributions, keys, admin.
Public keyed API (send `X-API-Key` header, 120 req/min): docs at `#/docs`.
- `GET /v1/lectures?query=&subject=&educator=&source=&page=&per=`
- `GET /v1/lectures/:publicId` (e.g. `LC-000001`)
- `GET /v1/educators`, `GET /v1/companies`

Keys are shown once at creation and stored hashed.

## Roadmap
1. **TLDB** (this) — catalog, contributions, admin, keyed API ✅
2. **Lectrio** — Stremio-style client: add "servers" (source configs), resolve a lecture's
   sources, play YouTube / archive / magnet / HLS / files. Free lectures play free; paid
   ones deep-link to the official purchase page.
