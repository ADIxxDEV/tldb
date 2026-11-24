CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT);
CREATE TABLE IF NOT EXISTS educators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  country TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'publisher',
  url TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  country TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  educator_id INTEGER REFERENCES educators(id),
  company_id INTEGER REFERENCES companies(id),
  subject TEXT DEFAULT '',
  year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS lectures (
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
  published_at TEXT);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  value INTEGER NOT NULL,
  UNIQUE(lecture_id, user_id));
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lecture_id, user_id));
CREATE TABLE IF NOT EXISTS view_log (
  lecture_id INTEGER NOT NULL REFERENCES lectures(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(lecture_id, day));
CREATE TABLE IF NOT EXISTS contributions (
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
  reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS feedback (
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
  reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lectures_status_published ON lectures(status, published_at);
CREATE INDEX IF NOT EXISTS idx_lectures_slug ON lectures(slug);
CREATE INDEX IF NOT EXISTS idx_lectures_public_id ON lectures(public_id);
CREATE INDEX IF NOT EXISTS idx_lectures_educator ON lectures(educator_id);
CREATE INDEX IF NOT EXISTS idx_lectures_company ON lectures(company_id);
CREATE INDEX IF NOT EXISTS idx_lectures_course ON lectures(course_id);
CREATE INDEX IF NOT EXISTS idx_lectures_subject ON lectures(subject);
CREATE INDEX IF NOT EXISTS idx_comments_lecture ON comments(lecture_id);
CREATE INDEX IF NOT EXISTS idx_votes_lecture ON votes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_viewlog_day ON view_log(day);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
