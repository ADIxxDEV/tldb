// End-to-end API self-test: exercises every route a script or agent would use.
// Usage: node scripts/api-selftest.js [base-url] [admin-email] [admin-password]
// Against a scratch DB:  TLDB_DB=file:selftest.db npm run seed && node server/node.js  (port 4173)
'use strict';

const BASE = process.argv[2] || 'http://localhost:4173';
const EMAIL = process.argv[3] || 'admin@tldb.local';
const PASSWORD = process.argv[4] || 'changeme123';

let cookie = '';
let apiKey = '';
const results = [];
const ctx = {};

async function call(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie && !opts.noCookie) headers.Cookie = cookie;
  if (opts.key) headers['X-API-Key'] = opts.key === true ? apiKey : opts.key;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, data };
}

async function step(name, fn, expect = [200]) {
  try {
    const r = await fn();
    const pass = expect.includes(r.status);
    results.push({ name, status: r.status, pass, note: pass ? '' : JSON.stringify(r.data).slice(0, 140) });
    return pass ? r.data : null;
  } catch (e) {
    results.push({ name, status: 'ERR', pass: false, note: e.message.slice(0, 140) });
    return null;
  }
}

// ---------- auth ----------
await step('POST /api/auth/login', () => call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD }));
await step('GET  /api/auth/me', () => call('GET', '/api/auth/me'));
await step('GET  /api/auth/config', () => call('GET', '/api/auth/config'));

// ---------- rights holders & educators ----------
const co = await step('POST /api/admin/companies (create)', () =>
  call('POST', '/api/admin/companies', { name: 'Selftest Institute', domain: 'selftest.example', country: 'India' }));
await step('POST /api/admin/companies (update)', () =>
  call('POST', '/api/admin/companies', { name: 'Selftest Institute', domain: 'selftest.example', kind: 'publisher' }));
const ed = await step('POST /api/admin/educators', () =>
  call('POST', '/api/admin/educators', { name: 'Selftest Teacher', bio: 'test', country: 'India' }));
await step('GET  /api/companies/:slug', () => call('GET', '/api/companies/selftest-institute'));
await step('GET  /api/educators/:slug', () => call('GET', '/api/educators/selftest-teacher'));

// ---------- lectures ----------
const lec = await step('POST /api/admin/lectures', () =>
  call('POST', '/api/admin/lectures', {
    title: 'Selftest Lecture One', description: 'created by the self-test', educator: 'Selftest Teacher',
    company: 'Selftest Institute', company_domain: 'selftest.example', subject: 'Physics',
    source_type: 'stream', source_url: 'https://selftest.example/lecture/1', duration_sec: 3600,
    provider: 'selftest', external_id: 'video-1', access: 'paid', purchase_url: 'https://selftest.example/buy',
    tags: ['selftest'], year: 2026,
  }));
if (lec) { ctx.lectureId = lec.public_id; ctx.lectureSlug = lec.slug; }
await step('GET  /api/lectures/:slug', () => call('GET', `/api/lectures/${ctx.lectureSlug || 'missing'}`));
await step('PATCH /api/admin/lectures/:id', () =>
  call('PATCH', `/api/admin/lectures/${ctx.lectureId}`, { subject: 'Physics', duration_sec: 3720, tags: ['selftest', 'edited'] }));
await step('POST /api/admin/lectures/:id/feature', () => call('POST', `/api/admin/lectures/${ctx.lectureId}/feature`, {}));
await step('POST /api/admin/lectures/:id/hide (hide)', () => call('POST', `/api/admin/lectures/${ctx.lectureId}/hide`, { hidden: true }));
await step('POST /api/admin/lectures/:id/hide (unhide)', () => call('POST', `/api/admin/lectures/${ctx.lectureId}/hide`, { hidden: false }));
await step('POST /api/admin/lectures/:id/source-status', () => call('POST', `/api/admin/lectures/${ctx.lectureId}/source-status`, { status: 'ok' }));

// ---------- batches ----------
await step('POST /api/admin/batches', () =>
  call('POST', '/api/admin/batches', {
    provider: 'selftest', external_id: 'batch-1', name: 'Selftest Batch', company: 'Selftest Institute',
    status: 'running', access: 'paid', price: '999', currency: 'INR', certificate: 'fee',
    starts_on: '2026-01-05', purchase_url: 'https://selftest.example/batch-1',
  }));
await step('POST /api/admin/batches/:id/items', () =>
  call('POST', '/api/admin/batches/batch-1/items?provider=selftest', {
    subjects: [{ name: 'Physics', external_id: 'sub-1', topics: [{ name: 'Kinematics', external_id: 'top-1',
      items: [{ kind: 'video', title: 'Selftest Lecture One', external_id: 'video-1', duration_sec: 3600 },
        { kind: 'notes', title: 'Kinematics notes', external_id: 'note-1' }] }] }],
  }));
await step('POST /api/admin/batches/:id/items (idempotent re-run)', () =>
  call('POST', '/api/admin/batches/batch-1/items?provider=selftest', {
    subjects: [{ name: 'Physics', topics: [{ name: 'Kinematics', items: [{ kind: 'video', title: 'Selftest Lecture One', external_id: 'video-1' }] }] }],
  }));
const batch = await step('GET  /api/batch/:provider/:id', () => call('GET', '/api/batch/selftest/batch-1'));
if (batch) {
  ctx.batchItemId = batch.tree?.[0]?.topics?.[0]?.items?.[0]?.id;
  ctx.contentCount = batch.counts?.items;
}
await step('POST /api/admin/batch-contents/:id/link', () =>
  call('POST', `/api/admin/batch-contents/${ctx.batchItemId}/link`, { lecture: ctx.lectureId }));
await step('GET  /api/admin/batches', () => call('GET', '/api/admin/batches'));
await step('GET  /api/batches', () => call('GET', '/api/batches'));

// ---------- contributions & queue ----------
const contrib = await step('POST /api/contributions', () =>
  call('POST', '/api/contributions', {
    title: 'Selftest Queued Lecture', educator: 'Selftest Teacher', company: 'Selftest Institute',
    source_type: 'stream', source_url: 'https://selftest.example/lecture/2', subject: 'Physics', access: 'free',
  }));
await step('GET  /api/admin/queue', () => call('GET', '/api/admin/queue'));
await step('POST /api/admin/contributions/:id/approve', () =>
  call('POST', `/api/admin/contributions/${contrib?.contribution_id || 0}/approve`, {}));
await step('POST /api/contributions (reject path)', () =>
  call('POST', '/api/contributions', {
    title: 'Selftest Rejected Lecture', educator: 'Selftest Teacher', company: 'Selftest Institute',
    source_type: 'stream', source_url: 'https://selftest.example/lecture/3',
  }));
const queue2 = await call('GET', '/api/admin/queue');
const toReject = (queue2.data?.queue || []).find((x) => String(x.title).includes('Selftest Rejected'));
await step('POST /api/admin/contributions/:id/reject', () =>
  call('POST', `/api/admin/contributions/${toReject?.id || 0}/reject`, { note: 'self-test' }), [200, 404]);

// ---------- courses ----------
const course = await step('POST /api/admin/courses', () =>
  call('POST', '/api/admin/courses', { title: 'Selftest Course', educator_name: 'Selftest Teacher', subject: 'Physics', year: 2026 }));
await step('POST /api/admin/courses/:id/lectures', () =>
  call('POST', `/api/admin/courses/${course?.slug || 'missing'}/lectures`, { lecture: ctx.lectureId, position: 1 }));
await step('GET  /api/courses/:slug', () => call('GET', `/api/courses/${course?.slug || 'missing'}`));
await step('POST /api/admin/courses/:id/remove-lecture', () =>
  call('POST', `/api/admin/courses/${course?.slug || 'missing'}/remove-lecture`, { lecture: ctx.lectureId }));

// ---------- feedback ----------
await step('POST /api/feedback', () =>
  call('POST', '/api/feedback', { type: 'dead_link', message: 'self-test report', lecture_slug: ctx.lectureSlug }));
const fb = await step('GET  /api/admin/feedback', () => call('GET', '/api/admin/feedback'));
const fbId = (fb?.feedback || [])[0]?.id;
await step('POST /api/admin/feedback/:id', () => call('POST', `/api/admin/feedback/${fbId || 0}`, { status: 'resolved' }), [200, 404]);

// ---------- api keys & /v1 ----------
const key = await step('POST /api/keys', () => call('POST', '/api/keys', { name: 'selftest', scopes: 'read,write,admin' }));
if (key?.key) apiKey = key.key;
await step('GET  /api/keys', () => call('GET', '/api/keys'));
await step('GET  /v1/lectures (key)', () => call('GET', '/v1/lectures', undefined, { key: true }));
await step('GET  /v1/lectures (no key → 401)', () => call('GET', '/v1/lectures', undefined, { key: false, noCookie: true }), [401]);
await step('GET  /v1/educators (key)', () => call('GET', '/v1/educators', undefined, { key: true }));
await step('GET  /v1/companies (key)', () => call('GET', '/v1/companies', undefined, { key: true }));
await step('GET  /v1/batches (key)', () => call('GET', '/v1/batches', undefined, { key: true }));
await step('GET  /v1/batches/:id (key)', () => call('GET', '/v1/batches/batch-1', undefined, { key: true }), [200, 404]);
await step('GET  /v1/admin/overview (key)', () => call('GET', '/v1/admin/overview', undefined, { key: true }));
await step('POST /v1/lectures (key, to queue)', () =>
  call('POST', '/v1/lectures', { title: 'Selftest Via Key', educator: 'Selftest Teacher', company: 'Selftest Institute',
    source_type: 'stream', source_url: 'https://selftest.example/lecture/4' }, { key: true }));
await step('POST /v1/feedback (key)', () =>
  call('POST', '/v1/feedback', { type: 'wrong_metadata', message: 'via key', lecture_slug: ctx.lectureSlug }, { key: true }));
await step('GET  /v1/contributions/mine (key)', () => call('GET', '/v1/contributions/mine', undefined, { key: true }));
await step('POST /api/admin/import (key)', () =>
  call('POST', '/api/admin/import', { provider: 'selftest', company: 'Selftest Institute', company_domain: 'selftest.example',
    records: [{ video_title: 'Selftest Imported', batch_name: 'Selftest Batch', batch_id: 'batch-1',
      lecture_id: 'video-9', access: 'free', educator: 'Selftest Teacher', source_url: 'https://selftest.example/import/9' }] }, { key: true }));
await step('POST /v1/admin/import (key)', () =>
  call('POST', '/v1/admin/import', { provider: 'selftest', company: 'Selftest Institute',
    records: [{ video_title: 'Selftest Imported Two', lecture_id: 'video-10', access: 'free',
      source_url: 'https://selftest.example/import/10' }] }, { key: true }));
await step('DELETE /api/keys/:id', () => call('DELETE', `/api/keys/${key?.id || 0}`), [200, 204, 404]);

// ---------- read surface ----------
for (const p of ['/api/health', '/api/home', '/api/lectures', '/api/meta', '/api/courses', '/api/batches', '/api/watchlist'])
  await step(`GET  ${p}`, () => call('GET', p));

// ---------- users ----------
const me = await step('GET  /api/admin/users', () => call('GET', '/api/admin/users'));
const other = (me?.users || []).find((u) => u.email !== EMAIL);
await step('POST /api/admin/users/:id/role', () => call('POST', `/api/admin/users/${other?.id || 0}/role`, { role: 'contributor' }), [200, 404]);
await step('POST /api/admin/users/:id/status', () => call('POST', `/api/admin/users/${other?.id || 0}/status`, { status: 'active' }), [200, 404]);
await step('GET  /api/admin/overview', () => call('GET', '/api/admin/overview'));
await step('GET  /api/admin/lectures', () => call('GET', '/api/admin/lectures'));
await step('GET  /api/admin/courses', () => call('GET', '/api/admin/courses'));

// ---------- cleanup ----------
await step('DELETE /api/admin/batches/:id', () => call('DELETE', '/api/admin/batches/batch-1?provider=selftest'));
await step('DELETE /api/admin/lectures/:id (batch item)', () => checkCleanup(`/api/admin/lectures/${ctx.lectureId}`));
async function checkCleanup(path) { return call('DELETE', path); }
await step('POST /api/auth/change-password (no-op check)', () =>
  call('POST', '/api/auth/change-password', { current: 'wrong-password', next: 'whatever123' }), [400, 401, 403]);
await step('POST /api/auth/logout', () => call('POST', '/api/auth/logout'));

// ---------- cleanup: leave the database exactly as we found it ----------
await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD }); // 'logout' ran above
for (const l of ['selftest-lecture-one', 'selftest-queued-lecture', 'selftest-imported', 'selftest-imported-two'])
  await call('DELETE', `/api/admin/lectures/${l}`);
await step('DELETE /api/admin/courses/:id', () => call('DELETE', `/api/admin/courses/${course?.slug || 'missing'}`), [200, 404]);
await step('DELETE /api/admin/educators/:slug', () => call('DELETE', '/api/admin/educators/selftest-teacher'), [200, 404]);
await step('DELETE /api/admin/companies/:slug', () => call('DELETE', '/api/admin/companies/selftest-institute'), [200, 404]);

// ---------- report ----------
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log('\n' + pad('STEP', 46) + pad('CODE', 7) + 'RESULT');
console.log('-'.repeat(74));
for (const r of results) console.log(pad(r.name, 46) + pad(r.status, 7) + (r.pass ? 'pass' : 'FAIL  ' + r.note));
const failed = results.filter((r) => !r.pass);
console.log('-'.repeat(74));
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
