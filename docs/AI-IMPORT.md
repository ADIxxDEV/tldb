# TLDB for AI agents — how to fill the catalogue

TLDB is a **metadata-only** catalogue. It never hosts video. An agent's job is to find lectures,
name the rights holder, and store the ids the company itself uses.

Base URL (production): `https://tldb.eapp.workers.dev`

## 1. Authenticate

Admin API keys are sent as a header:

```
X-API-Key: tldb_xxxxxxxxxxxxxxxx
```

Key scopes: `read` (students), `read,write` (contributors), `read,write,admin` (admins).
Create/rotate keys in the account page (`#/account`) or `POST /api/keys`.

## 2. Bulk import (the main door for an AI)

```
POST /api/admin/import
Content-Type: application/json
X-API-Key: <admin key>
```

```json
{
  "provider": "pw",
  "company": "Physics Wallah",
  "company_domain": "pw.live",
  "records": [
    {
      "video_title": "Kinematics 01: Motion in a Straight Line",
      "batch_name": "Lakshya JEE 2025",
      "batch_id": "64b7f2c9e1a2b3c4d5e6f701",
      "subject_id": "64b7f2c9e1a2b3c4d5e6f702",
      "topic_id": "64b7f2c9e1a2b3c4d5e6f703",
      "lecture_id": "672a1b2c3d4e5f6a7b8c9d01",
      "access": "paid",
      "educator": "Alakh Pandey",
      "subject": "Physics",
      "duration_sec": 4200,
      "language": "hi",
      "year": 2024,
      "source_url": "https://www.pw.live/",
      "purchase_url": "https://www.pw.live/"
    }
  ]
}
```

Response: `{"ok":true,"provider":"pw","created":1,"skipped":0,"failed":0,"records":[{...}]}`

Rules the importer enforces:

| field | required | notes |
|---|---|---|
| `video_title` | yes | the lecture title |
| `lecture_id` | yes | **the provider's original video id**, non-numeric, stored as TEXT. Aliases accepted: `video_id`, `videoId`, `schedule_id`, `id`, `_id` |
| `batch_name` | no | batch / course name |
| `batch_id` | no | the provider's batch id (aliases `batchId`) |
| `subject_id` | no | provider subject id inside the batch |
| `topic_id` | no | provider topic/chapter id (aliases `topicId`, `chapter_id`) |
| `access` | no | `free` or `paid` (default `free`, or `"paid": true`) |
| `educator` | no | teacher name (alias `byName`); defaults to the company |
| `purchase_url` | no | set this for every paid record — the official page |
| `source_url` | no | where the content lives |
| `subject`, `duration_sec`, `language`, `year`, `tags` | no | plain metadata |

**Idempotent:** a record is skipped if `provider + batch_id + external_id` already exists.
Re-running an import is always safe.

**Id hierarchy — Physics Wallah** (provider key `pw`, from `api.penpencil.co`):

```
batch_id  →  /v3/batches/{batch_id}/details
          →  /v2/batches/{batch_id}/subject/{subject_id}/topics
          →  /v2/batches/{batch_id}/subject/{subject_id}/contents?tag={topic_id}
          →  /v1/batches/{batch_id}/subject/{subject_id}/schedule/{video_id}/schedule-details
```

**Id hierarchy — Vibrant Academy, Kota** (provider key `vibrant`, from
`vibrantacademykotaapi.akamai.net.in`, header set `Client-Service: Appx`, `Auth-Key: appxapi`):

```
batch_id (course_id)  →  /get/folder_contentsv3?course_id={batch_id}&parent_id=-1
                      →  subject_id (a folder row: material_type FOLDER)
                      →  /get/folder_contentsv3?course_id={batch_id}&parent_id={subject_id}
                      →  topic_id (child folder id)
                      →  lecture_id (the row with material_type VIDEO)
```

Vibrant ids are opaque strings the platform hands out (`"1234"`, `"567890"`, `"567901"`,
`"987654"`). Keep them **exactly** as given, as text — never renumber, never convert to a
number, never reshape them into JSON keys or SQL columns. The same rule applies to PW.

Never invent an id. Copy the one the company gives you, as text.

Bundled samples: `data/pw-sample.json` and `data/vibrant-sample.json` (each starts with a
`_format` block describing every field).

## 2b. Import a whole batch structure (course → subject → topic → items)

```
POST /api/admin/import-batch
X-API-Key: <admin key>
```

```json
{
  "provider": "pw", "company": "Physics Wallah", "company_domain": "pw.live",
  "batch": {
    "name": "Lakshya JEE 2025", "external_id": "64b7...f701",
    "status": "running", "access": "paid", "price": "4,999", "currency": "INR",
    "certificate": "fee", "certification_note": "…", "starts_on": "2024-05-06",
    "purchase_url": "https://www.pw.live/", "language": "hi", "lecture_count": 6
  },
  "subjects": [{
    "name": "Physics", "external_id": "64b7...f702",
    "topics": [{
      "name": "Kinematics", "external_id": "64b7...f703",
      "items": [
        { "kind": "video", "title": "Kinematics 01", "external_id": "672a...9d01", "duration_sec": 4200 },
        { "kind": "notes", "title": "Kinematics — class notes", "external_id": "672a...9d03" }
      ]
    }]
  }]
}
```

`kind` is `video | notes | pdf | test | dpp`. Re-importing the same `provider + external_id`
replaces that batch's tree. Response: `{ok, batch_id, slug, subjects, topics, items}`.

Bundled example: `data/pw-batch-sample.json`; CLI: `node scripts/import-batch.js <base> <email> <password> <file>`.

## 3. Read endpoints (public, no key needed for most)

| endpoint | what it gives |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/lectures?q=&subject=&provider=&access=&batch=&page=&sort=` | browse/search |
| `GET /api/lectures/:slugOrPublicId` | one record |
| `GET /api/meta` | subjects, batches, providers, access split |
| `GET /api/courses` | courses / playlists |
| `GET /v1/lectures` — needs `read` key | JSON API version |
| `GET /v1/batches?provider=pw` | every batch with id, name, lecture count |
| `GET /v1/batches/:batchId` | the whole batch, ordered, with each lecture's video/subject/topic id |
| `GET /api/batches?provider=pw&status=running` | batch/course cards — name, status, price, certificate |
| `GET /api/batch/:provider/:externalId` | one batch: facts + full subject → topic → item tree |

## 4. Write endpoints

| endpoint | scope | purpose |
|---|---|---|
| `POST /v1/lectures` | `write` | submit one lecture → admin queue |
| `POST /v1/feedback` | `write` | report a dead link / wrong metadata |
| `GET /v1/contributions/mine` | `write` | status of your submissions |
| `POST /api/admin/import` | `admin` | bulk import (above) |
| `POST /api/admin/contributions/:id/approve` | `admin` | publish a queued submission |
| `POST /api/admin/contributions/:id/reject` | `admin` | reject with a note |
| `GET /api/admin/overview`, `/queue`, `/lectures`, `/users`, `/feedback` | `admin` | panels |
| `POST /api/admin/lectures/:id/hide` | `admin` | unlist / relist |
| `POST /api/admin/lectures/:id/feature` | `admin` | toggle featured |
| `POST /api/admin/courses` | `admin` | create a course |
| `POST /api/admin/courses/:id/lectures` | `admin` | assign lecture at a position |

Anything with `/api/admin/*` also works under `/v1/admin/*`.

## 5. Available providers

| provider key | rights holder | domain |
|---|---|---|
| `pw` | Physics Wallah | pw.live |
| `vibrant` | Vibrant Academy | vibrantacademy.com |

Add a provider by sending a new `provider` key in the import payload — the company row is
created automatically from `company` + `company_domain`.

## 6. A prompt you can hand to any AI

> You are filling the TLDB catalogue (a metadata-only lecture index at
> https://tldb.eapp.workers.dev). Use the admin API key from the environment variable
> TLDB_KEY. Read the batch/lecture ids exactly as the source platform publishes them —
> never invent or renumber them. For Physics Wallah the chain is batch id → subject id →
> topic id → video id. For every lecture POST it to /api/admin/import with keys
> video_title, batch_name, batch_id, subject_id, topic_id, lecture_id, access (free|paid),
> educator, subject, duration_sec, source_url and purchase_url (required when paid).
> Do not scrape video, DRM keys or tokens; ids, titles and links only. Batch requests
> into groups of ~50 records, check `created`/`skipped`/`failed` in each response, and
> stop if `failed` is non-zero so a human can look.

## 7. What is never acceptable

- Hosting, mirroring or proxying the video itself.
- Bypassing DRM, collecting keys/tokens, or scraping signed stream URLs.
- Publishing a paid lecture without its official `purchase_url`.
- A record without a named rights holder.
