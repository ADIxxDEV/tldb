// TLDB DB layer — dual mode:
//   local/dev : libSQL file (node: @libsql/client)      TLDB_DB=file:tldb.db
//   prod      : Cloudflare D1 binding (Workers)          env.TLDB_DB
// Same async q.get/q.all/q.run API for both.
'use strict';
// @libsql/client is imported lazily so the Cloudflare Workers bundle never pulls it in.

let client = null;
let mode = 'libsql'; // 'libsql' | 'd1'

export async function setupDb({ d1, url, authToken } = {}) {
  if (d1) { client = d1; mode = 'd1'; }
  else {
    const { createClient } = await import('@libsql/client');
    client = createClient({ url: url || process.env.TLDB_DB || 'file:tldb.db', authToken: authToken || process.env.TLDB_DB_TOKEN });
    mode = 'libsql';
  }
}

export const SCHEMA_STATEMENTS = [
`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT)`,
`CREATE TABLE IF NOT EXISTS educators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  country TEXT DEFAULT '')`,
`CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'publisher',
  url TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  country TEXT DEFAULT '')`,
`CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  educator_id INTEGER REFERENCES educators(id),
  company_id INTEGER REFERENCES companies(id),
  subject TEXT DEFAULT '',
  year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
`CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',        -- the provider's own batch/course id
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  company_id INTEGER REFERENCES companies(id),
  rights_holder TEXT DEFAULT '',
  status TEXT DEFAULT 'unknown',               -- running | ended | upcoming | unknown
  access TEXT DEFAULT 'paid',                  -- free | paid
  price TEXT DEFAULT '',                       -- as shown by the institute, e.g. "4,999"
  currency TEXT DEFAULT 'INR',
  certificate TEXT DEFAULT 'unknown',          -- none | included | fee | exam | unknown
  certification_note TEXT DEFAULT '',
  starts_on TEXT DEFAULT '',
  ends_on TEXT DEFAULT '',
  purchase_url TEXT DEFAULT '',
  language TEXT DEFAULT '',
  lecture_count INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
`CREATE TABLE IF NOT EXISTS batch_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  external_id TEXT DEFAULT '',                 -- provider's subject / folder id
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  lecture_count INTEGER DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS batch_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES batch_subjects(id),
  external_id TEXT DEFAULT '',                 -- provider's topic / chapter id
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  lecture_count INTEGER DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS batch_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES batch_topics(id),
  kind TEXT NOT NULL DEFAULT 'video',          -- video | notes | pdf | test | dpp
  title TEXT NOT NULL,
  external_id TEXT DEFAULT '',                 -- provider's video / material id
  duration_sec INTEGER DEFAULT 0,
  lecture_id INTEGER REFERENCES lectures(id),  -- set when this item is catalogued as a lecture record
  url TEXT DEFAULT '',                         -- official page for this item (no files here)
  position INTEGER DEFAULT 0)`,
`CREATE INDEX IF NOT EXISTS idx_batches_provider ON batches(provider, external_id)`,
`CREATE INDEX IF NOT EXISTS idx_batch_subjects_batch ON batch_subjects(batch_id)`,
`CREATE INDEX IF NOT EXISTS idx_batch_topics_subject ON batch_topics(subject_id)`,
`CREATE INDEX IF NOT EXISTS idx_batch_contents_topic ON batch_contents(topic_id)`,
`CREATE TABLE IF NOT EXISTS lectures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  educator_id INTEGER REFERENCES educators(id),
  company_id INTEGER REFERENCES companies(id),
  rights_holder TEXT DEFAULT '',
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  duration_sec INTEGER DEFAULT 0,
  language TEXT DEFAULT 'en',
  subject TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  batch_name TEXT DEFAULT '',               -- original batch/cohort the lecture came from
  provider TEXT DEFAULT '',                 -- source platform (pw, unacademy, youtube, ...)
  batch_id TEXT DEFAULT '',                 -- provider's batch id (non-numeric, e.g. PW batch _id)
  subject_id TEXT DEFAULT '',               -- provider's subject id within the batch
  topic_id TEXT DEFAULT '',                 -- provider's topic/chapter id
  external_id TEXT DEFAULT '',              -- the provider's own non-numeric content id (e.g. PW video id)
  access TEXT DEFAULT 'free',               -- free | paid
  purchase_url TEXT DEFAULT '',             -- where to buy when access = paid
  hidden INTEGER DEFAULT 0,                 -- 1 = unlisted: off the dashboard, found only via search/direct link
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER DEFAULT 0,
  course_id INTEGER REFERENCES courses(id),
  position INTEGER,
  source_status TEXT NOT NULL DEFAULT 'ok',   -- ok | dead
  submitted_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  review_note TEXT DEFAULT '',
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT)`,
`CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
`CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  value INTEGER NOT NULL,
  UNIQUE(lecture_id, user_id))`,
`CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lecture_id, user_id))`,
`CREATE TABLE IF NOT EXISTS view_log (
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(lecture_id, day))`,
`CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id INTEGER,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id INTEGER REFERENCES users(id),
  review_note TEXT DEFAULT '',
  lecture_id INTEGER REFERENCES lectures(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT)`,
`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  lecture_id INTEGER REFERENCES lectures(id),
  educator_id INTEGER REFERENCES educators(id),
  company_id INTEGER REFERENCES companies(id),
  type TEXT NOT NULL DEFAULT 'report',      -- report | edit | other
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- open | resolved | dismissed
  reviewer_id INTEGER REFERENCES users(id),
  resolution_note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT)`,
`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL)`,
// ---------- indexes (query performance at scale) ----------
`CREATE INDEX IF NOT EXISTS idx_lectures_status_published ON lectures(status, published_at)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_slug ON lectures(slug)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_public_id ON lectures(public_id)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_educator ON lectures(educator_id)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_company ON lectures(company_id)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_course ON lectures(course_id)`,
`CREATE INDEX IF NOT EXISTS idx_lectures_subject ON lectures(subject)`,
`CREATE INDEX IF NOT EXISTS idx_comments_lecture ON comments(lecture_id)`,
`CREATE INDEX IF NOT EXISTS idx_votes_lecture ON votes(lecture_id)`,
`CREATE INDEX IF NOT EXISTS idx_viewlog_day ON view_log(day)`,
`CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status, created_at)`,
`CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at)`,
`CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)`,
`CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash)`,
];

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;
  if (mode === 'libsql') await client.execute('PRAGMA journal_mode = WAL;');
  // light migrations for pre-existing databases (local AND remote D1)
  const addCols = [
    ['educators', 'image_url', "TEXT DEFAULT ''"],
    ['companies', 'domain', "TEXT DEFAULT ''"],
    ['lectures', 'featured', 'INTEGER DEFAULT 0'],
    ['educators', 'country', "TEXT DEFAULT ''"],
    ['companies', 'country', "TEXT DEFAULT ''"],
    ['lectures', 'course_id', 'INTEGER'],
    ['lectures', 'position', 'INTEGER'],
    ['lectures', 'source_status', "TEXT DEFAULT 'ok'"],
    ['lectures', 'batch_name', "TEXT DEFAULT ''"],
    ['lectures', 'provider', "TEXT DEFAULT ''"],
    ['lectures', 'batch_id', "TEXT DEFAULT ''"],
    ['lectures', 'subject_id', "TEXT DEFAULT ''"],
    ['lectures', 'topic_id', "TEXT DEFAULT ''"],
    ['lectures', 'external_id', "TEXT DEFAULT ''"],
    ['lectures', 'access', "TEXT DEFAULT 'free'"],
    ['lectures', 'purchase_url', "TEXT DEFAULT ''"],
    ['lectures', 'hidden', 'INTEGER DEFAULT 0'],
  ];
  for (const [table, col, def] of addCols) {
    const info = mode === 'd1'
      ? (await client.prepare(`PRAGMA table_info(${table})`).all()).results
      : (await client.execute(`PRAGMA table_info(${table})`)).rows;
    const cols = info.map(r => r.name);
    if (cols.length && !cols.includes(col)) {
      const stmt = `ALTER TABLE ${table} ADD COLUMN ${col} ${def}`;
      if (mode === 'd1') await client.prepare(stmt).run();
      else await client.execute(stmt);
    }
  }
  for (const stmt of SCHEMA_STATEMENTS) {
    if (mode === 'd1') await client.prepare(stmt).run();
    else await client.execute(stmt);
  }
  schemaReady = true;
}

export const q = {
  get: async (sql, ...p) => {
    if (mode === 'd1') return (await client.prepare(sql).bind(...p).first()) || null;
    return (await client.execute({ sql, args: p })).rows[0] || null;
  },
  all: async (sql, ...p) => {
    if (mode === 'd1') return (await client.prepare(sql).bind(...p).all()).results;
    return (await client.execute({ sql, args: p })).rows;
  },
  run: async (sql, ...p) => {
    if (mode === 'd1') {
      const r = await client.prepare(sql).bind(...p).run();
      return { lastInsertRowid: Number(r.meta.last_row_id), changes: Number(r.meta.changes) };
    }
    const rs = await client.execute({ sql, args: p });
    return { lastInsertRowid: Number(rs.lastInsertRowid), changes: Number(rs.rowsAffected) };
  },
};

// ---------- portable crypto (works in Node AND Workers) ----------
const enc = new TextEncoder();
const toHex = (buf) => [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const s = String(stored);
  if (s.startsWith('pbkdf2$')) {
    const [, iters, saltHex, hashHex] = s.split('$');
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(iters), hash: 'SHA-256' }, key, 256);
    return timingSafeEq(toHex(new Uint8Array(bits)), hashHex);
  }
  return false; // legacy scrypt hashes are not portable to Workers — reseed or reset
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return toHex(new Uint8Array(buf));
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
}

export async function nextPublicId() {
  const row = await q.get(`SELECT COUNT(*) AS n FROM lectures WHERE status = 'published'`);
  return 'LC-' + String((row?.n || 0) + 1).padStart(6, '0');
}

export async function logView(lectureId) {
  const day = new Date().toISOString().slice(0, 10);
  await q.run(
    `INSERT INTO view_log (lecture_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(lecture_id, day) DO UPDATE SET count = count + 1`, lectureId, day);
}
