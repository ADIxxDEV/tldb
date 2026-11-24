// Batch (course) pages: the provider's own course → subject → topic → item structure.
// Metadata only — TLDB stores names, ids, prices and links. It never stores files or streams.
'use strict';
import { Hono } from 'hono';
import { q } from '../db.js';
import { slugify } from '../db.js';

export const batchRoutes = new Hono();

function titleCase(s) {
  return String(s || '').replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

function batchRow(r) {
  return {
    id: r.id,
    provider: r.provider,
    external_id: r.external_id,
    slug: r.slug,
    name: r.name,
    subtitle: r.subtitle || '',
    status: r.status || 'unknown',
    access: r.access || 'paid',
    price: r.price || '',
    currency: r.currency || 'INR',
    certificate: r.certificate || 'unknown',
    certification_note: r.certification_note || '',
    starts_on: r.starts_on || '',
    ends_on: r.ends_on || '',
    purchase_url: r.purchase_url || '',
    language: r.language || '',
    lecture_count: Number(r.lecture_count || 0),
    description: r.description || '',
    company: r.company_name || r.rights_holder || '',
    company_slug: r.company_slug || '',
    domain: r.company_domain || '',
    kind: r.kind || 'batch',
  };
}

export const BATCH_SELECT = `
  SELECT b.*, c.name AS company_name, c.slug AS company_slug, c.domain AS company_domain, 'batch' AS kind
  FROM batches b LEFT JOIN companies c ON c.id = b.company_id`;

// ---------- list ----------
batchRoutes.get('/batches', async (c) => {
  const provider = c.req.query('provider') || '';
  const status = c.req.query('status') || '';
  const rows = await q.all(
    `${BATCH_SELECT}
     WHERE 1 = 1 ${provider ? 'AND b.provider = ?' : ''} ${status ? 'AND b.status = ?' : ''}
     ORDER BY (b.status = 'running') DESC, b.created_at DESC LIMIT 200`,
    ...(provider ? [provider] : []), ...(status ? [status] : []));
  return c.json({ batches: rows.map(batchRow) });
});

// ---------- one batch with its whole tree ----------
batchRoutes.get('/batch/:provider/:externalId', async (c) => {
  const provider = c.req.param('provider');
  const ext = c.req.param('externalId');
  const b = await q.get(`${BATCH_SELECT} WHERE b.provider = ? AND b.external_id = ?`, provider, ext)
    || await q.get(`${BATCH_SELECT} WHERE b.slug = ?`, ext);
  if (!b) return c.json({ error: 'Batch not found' }, 404);

  const subjects = await q.all(
    `SELECT * FROM batch_subjects WHERE batch_id = ? ORDER BY position, id`, b.id);
  const topics = subjects.length
    ? await q.all(
        `SELECT * FROM batch_topics WHERE subject_id IN (${subjects.map(() => '?').join(',')})
         ORDER BY position, id`, ...subjects.map((s) => s.id))
    : [];
  const contents = topics.length
    ? await q.all(
        `SELECT * FROM batch_contents WHERE topic_id IN (${topics.map(() => '?').join(',')})
         ORDER BY position, id`, ...topics.map((t) => t.id))
    : [];

  const tree = subjects.map((s) => ({
    id: s.id,
    external_id: s.external_id,
    name: s.name,
    lecture_count: Number(s.lecture_count || 0),
    topics: topics.filter((t) => t.subject_id === s.id).map((t) => ({
      id: t.id,
      external_id: t.external_id,
      name: t.name,
      lecture_count: Number(t.lecture_count || 0),
      items: contents.filter((x) => x.topic_id === t.id).map((x) => ({
        id: x.id,
        kind: x.kind,
        title: x.title,
        external_id: x.external_id,
        duration_sec: Number(x.duration_sec || 0),
        lecture_id: x.lecture_id,
        url: x.url,
      })),
    })),
  }));

  const allItems = contents.length;
  return c.json({
    batch: { ...batchRow(b), kind: b.provider || 'batch' },
    tree,
    counts: {
      subjects: subjects.length,
      topics: topics.length,
      items: allItems,
      videos: contents.filter((x) => x.kind === 'video').length,
      notes: contents.filter((x) => x.kind !== 'video').length,
    },
  });
});

// ---------- import a whole batch tree (admin) ----------
// Body: { provider, company, company_domain, batch: {...}, subjects: [{ name, external_id, topics: [{ name, external_id, items: [{kind,title,external_id,url,duration_sec}] }] }] }
batchRoutes.post('/admin/import-batch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const b = body.batch || {};
  const provider = String(b.provider || body.provider || '').toLowerCase();
  const ext = String(b.external_id || b.batch_id || body.batch_id || '').trim();
  const name = String(b.name || b.batch_name || '').trim();
  if (!provider || !ext || !name) return c.json({ error: 'provider, external_id and name are required' }, 400);

  const companyName = String(body.company || b.rights_holder || '');
  let companyId = null;
  if (companyName) {
    const cslug = slugify(companyName);
    const found = await q.get(`SELECT id FROM companies WHERE slug = ?`, cslug);
    companyId = found?.id ?? (await q.run(
      `INSERT INTO companies (slug, name, kind, domain, country) VALUES (?,?,?,?,?)`,
      cslug, companyName, 'publisher', String(body.company_domain || ''), String(body.country || ''))).lastInsertRowid;
  }

  let slug = slugify(String(b.slug || `${provider}-${name}`));
  if (await q.get(`SELECT id FROM batches WHERE slug = ?`, slug)) slug = `${slug}-${ext}`.slice(0, 90);

  const existing = await q.get(`SELECT id FROM batches WHERE provider = ? AND external_id = ?`, provider, ext);
  let batchId;
  const fields = [
    provider, ext, slug, name, String(b.subtitle || ''), companyId, String(b.rights_holder || companyName),
    String(b.status || 'unknown'), String(b.access || 'paid'), String(b.price || ''), String(b.currency || 'INR'),
    String(b.certificate || 'unknown'), String(b.certification_note || ''), String(b.starts_on || ''),
    String(b.ends_on || ''), String(b.purchase_url || ''), String(b.language || ''),
    Number(b.lecture_count || 0), String(b.description || ''), JSON.stringify(b.meta || {}),
  ];
  if (existing) {
    batchId = existing.id;
    await q.run(
      `UPDATE batches SET provider=?, external_id=?, slug=?, name=?, subtitle=?, company_id=?, rights_holder=?,
         status=?, access=?, price=?, currency=?, certificate=?, certification_note=?, starts_on=?, ends_on=?,
         purchase_url=?, language=?, lecture_count=?, description=?, meta=? WHERE id=?`,
      ...fields, batchId);
    await q.run(`DELETE FROM batch_contents WHERE topic_id IN (SELECT id FROM batch_topics WHERE subject_id IN (SELECT id FROM batch_subjects WHERE batch_id = ?))`, batchId);
    await q.run(`DELETE FROM batch_topics WHERE subject_id IN (SELECT id FROM batch_subjects WHERE batch_id = ?)`, batchId);
    await q.run(`DELETE FROM batch_subjects WHERE batch_id = ?`, batchId);
  } else {
    batchId = (await q.run(
      `INSERT INTO batches (provider, external_id, slug, name, subtitle, company_id, rights_holder,
         status, access, price, currency, certificate, certification_note, starts_on, ends_on,
         purchase_url, language, lecture_count, description, meta)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...fields)).lastInsertRowid;
  }

  const subjects = Array.isArray(body.subjects) ? body.subjects : [];
  let subjN = 0, topicN = 0, itemN = 0;
  for (const [si, s] of subjects.entries()) {
    const sId = (await q.run(
      `INSERT INTO batch_subjects (batch_id, external_id, name, position, lecture_count) VALUES (?,?,?,?,?)`,
      batchId, String(s.external_id || ''), String(s.name || `Subject ${si + 1}`), si, Number(s.lecture_count || 0))).lastInsertRowid;
    subjN++;
    for (const [ti, t] of (Array.isArray(s.topics) ? s.topics : []).entries()) {
      const tId = (await q.run(
        `INSERT INTO batch_topics (subject_id, external_id, name, position, lecture_count) VALUES (?,?,?,?,?)`,
        sId, String(t.external_id || ''), String(t.name || `Topic ${ti + 1}`), ti, Number(t.lecture_count || 0))).lastInsertRowid;
      topicN++;
      for (const [ii, it] of (Array.isArray(t.items) ? t.items : []).entries()) {
        await q.run(
          `INSERT INTO batch_contents (topic_id, kind, title, external_id, duration_sec, url, position) VALUES (?,?,?,?,?,?,?)`,
          tId, String(it.kind || 'video'), String(it.title || it.name || 'Item'), String(it.external_id || it.id || ''),
          Number(it.duration_sec || 0), String(it.url || ''), ii);
        itemN++;
      }
    }
  }
  return c.json({ ok: true, batch_id: batchId, slug, subjects: subjN, topics: topicN, items: itemN });
});
