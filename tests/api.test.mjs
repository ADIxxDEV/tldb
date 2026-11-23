// TLDB API test suite — run with: npm test
// Spawns a real server on an isolated test DB and asserts the core flows.
'use strict';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;
const DB = 'tldb-test.db';
let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.ip ? { 'CF-Connecting-IP': opts.ip } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { if (existsSync(f)) rmSync(f); } catch {} }
  const child = spawn(process.execPath, ['server/node.js'], {
    env: { ...process.env, PORT: String(PORT), TLDB_DB: 'file:' + DB },
    stdio: 'ignore',
  });
  child.unref();
  globalThis.__child = child;
  // wait for the server to accept connections
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/api/health'); return; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  throw new Error('test server did not start');
});

after(() => {
  try { globalThis.__child?.kill(); } catch {}
  // files may still be locked for a moment on Windows — best effort
  setTimeout(() => { for (const f of [DB, DB + '-wal', DB + '-shm']) { try { if (existsSync(f)) rmSync(f); } catch {} } }, 500).unref?.();
});

test('health check', async () => {
  const r = await api('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.service, 'tldb');
});

test('home aggregate works on a fresh DB', async () => {
  const r = await api('/home');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.top));
});

test('signup rejects disposable email', async () => {
  const r = await api('/auth/signup', { body: { email: 'scammer@mailinator.com', name: 'Tmp', password: 'password123' } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Disposable/i);
});

test('signup rejects temp-style domains (heuristic)', async () => {
  const r = await api('/auth/signup', { body: { email: 'a@my-tempmail-box.xyz', name: 'Tmp', password: 'password123' } });
  assert.equal(r.status, 400);
});

test('signup accepts a real email and first account is admin', async () => {
  const r = await api('/auth/signup', { body: { email: 'admin@test.local', name: 'Admin', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
});

test('second signup is a student', async () => {
  cookie = '';
  const r = await api('/auth/signup', { body: { email: 'student@test.local', name: 'Stu', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'student');
});

test('login works with correct credentials', async () => {
  cookie = '';
  const r = await api('/auth/login', { body: { email: 'admin@test.local', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
});

test('login rejects wrong password', async () => {
  cookie = '';
  const r = await api('/auth/login', { body: { email: 'admin@test.local', password: 'wrongwrong' } });
  assert.equal(r.status, 401);
});

test('catalog lists nothing on empty DB but responds', async () => {
  const r = await api('/lectures');
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 0);
});

test('v1 API requires a key', async () => {
  const res = await fetch(BASE + '/v1/lectures');
  assert.equal(res.status, 401);
  const res2 = await fetch(BASE + '/v1/lectures', { headers: { 'X-API-Key': 'tldb_bogus' } });
  assert.equal(res2.status, 401);
});

test('auth brute-force is IP rate-limited (10/min)', async () => {
  cookie = '';
  let last = 0;
  for (let i = 0; i < 14; i++) {
    const r = await api('/auth/login', { body: { email: 'admin@test.local', password: 'nope' }, ip: '203.0.113.9' });
    last = r.status;
  }
  assert.equal(last, 429);
});

test('different IP is not affected by the other IP limit', async () => {
  cookie = '';
  const r = await api('/auth/login', { body: { email: 'admin@test.local', password: 'nope' }, ip: '198.51.100.7' });
  assert.equal(r.status, 401);
});

test('change-password flow', async () => {
  cookie = '';
  await api('/auth/login', { body: { email: 'student@test.local', password: 'password123' } });
  const r = await api('/auth/change-password', { body: { current: 'password123', next: 'newpass98765' } });
  assert.equal(r.status, 200);
  cookie = '';
  const relogin = await api('/auth/login', { body: { email: 'student@test.local', password: 'newpass98765' } });
  assert.equal(relogin.status, 200);
});

test('admin endpoints reject non-admins', async () => {
  cookie = '';
  await api('/auth/login', { body: { email: 'student@test.local', password: 'newpass98765' } });
  const r = await api('/admin/overview');
  assert.equal(r.status, 403);
});
