// Seed TLDB with the admin account + real, freely-available lectures (metadata only)
'use strict';
import { q, setupDb, ensureSchema as init, hashPassword, slugify, nextPublicId } from './db.js';

async function upsertEducator(name, image_url = '', country = '') {
  const slug = slugify(name);
  const found = await q.get(`SELECT id FROM educators WHERE slug = ?`, slug);
  if (found) {
    if (country) await q.run(`UPDATE educators SET country = ? WHERE id = ?`, country, found.id);
    return found.id;
  }
  return (await q.run(`INSERT INTO educators (slug, name, image_url, country) VALUES (?,?,?,?)`, slug, name, image_url || '', country)).lastInsertRowid;
}
async function upsertCompany(name, kind = 'publisher', domain = '', country = '') {
  const slug = slugify(name);
  const found = await q.get(`SELECT id FROM companies WHERE slug = ?`, slug);
  if (found) {
    if (country) await q.run(`UPDATE companies SET country = ? WHERE id = ?`, country, found.id);
    return found.id;
  }
  return (await q.run(`INSERT INTO companies (slug, name, kind, domain, country) VALUES (?,?,?,?,?)`, slug, name, kind, domain || '', country)).lastInsertRowid;
}

async function addLecture(adminId, l) {
  const slug = slugify(l.title);
  if (await q.get(`SELECT id FROM lectures WHERE slug = ?`, slug)) return;
  const publicId = await nextPublicId();
  await q.run(
    `INSERT INTO lectures (public_id, title, slug, description, educator_id, company_id, rights_holder,
       source_type, source_url, duration_sec, language, subject, tags, batch_name, year, status, featured,
       submitted_by, reviewed_by, published_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'published', ?, ?, ?, datetime('now'))`,
    publicId, l.title, slug, l.description || '', await upsertEducator(l.educator, l.educator_image || '', l.country || ''),
    l.company ? await upsertCompany(l.company, l.company_kind || 'publisher', l.domain || '', l.country || '') : null,
    l.rights_holder || l.educator, l.source_type, l.source_url, l.duration_sec || 0, l.language || 'en',
    l.subject || '', JSON.stringify(l.tags || []), l.batch_name || '', l.year || null, l.featured ? 1 : 0, adminId, adminId);
  console.log('  +', publicId, l.title);
}

await setupDb();
await init();
const email = 'admin@tldb.local';
if (!(await q.get(`SELECT id FROM users WHERE email = ?`, email))) {
  const pw = process.env.TLDB_ADMIN_PW || 'changeme123';
  await q.run(`INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?, 'admin')`, email, 'TLDB Admin', await hashPassword(pw));
  console.log(`Admin created → ${email} / ${pw}  (CHANGE THIS)`);
} else { console.log('Admin already exists'); }
const admin = await q.get(`SELECT id FROM users WHERE email = ?`, email);

const seed = [
  { title: 'Lecture 1: Introduction to Algorithms', educator: 'MIT OpenCourseWare', country: 'United States', company: 'MIT', domain: 'mit.edu', country: 'United States', subject: 'Computer Science', source_type: 'youtube', source_url: 'https://www.youtube.com/playlist?list=PLUl4u3cNGP61Oq3tWYp6V_F-5jb5L2iHb', tags: ['algorithms', 'cs', 'mit'], batch_name: 'MIT 6.006', year: 2020, featured: true, description: 'MIT 6.006 Introduction to Algorithms — the classic opening lecture covering course logistics and algorithmic thinking.' },
  { title: 'Lecture 0: Scratch — CS50', educator: 'David J. Malan', country: 'United States', company: 'Harvard University', domain: 'harvard.edu', country: 'United States', subject: 'Computer Science', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=SYqzc0SMOw8', tags: ['cs50', 'cs', 'programming'], batch_name: 'CS50 2024', year: 2024, featured: true, duration_sec: 9120, description: 'Harvard CS50x opens with computational thinking, Scratch, and the art of programming from zero.' },
  { title: 'Linear Algebra Done Right: Vector Spaces', educator: 'Sheldon Axler', country: 'United States', subject: 'Mathematics', source_type: 'youtube', source_url: 'https://www.youtube.com/results?search_query=axler+linear+algebra', tags: ['linear-algebra', 'math'], description: 'Abstract vector spaces explained the "done right" way — no determinants required.' },
  { title: '8.01 Lecture 1: Powers of Ten, Units, Dimensions', educator: 'Walter Lewin', country: 'United States', educator_image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Walter_Lewin_May_16%2C_2011_talk_at_MIT.png/500px-Walter_Lewin_May_16%2C_2011_talk_at_MIT.png', company: 'MIT', domain: 'mit.edu', country: 'United States', subject: 'Physics', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=wWnfJ0-xXRE', tags: ['physics', 'mechanics', 'mit'], batch_name: 'MIT 8.01', year: 1999, featured: true, duration_sec: 2820, description: 'The legendary opening lecture of MIT 8.01 Classical Mechanics — measurements, dimensions, and the scale of the universe.' },
  { title: 'Cosmos: A Personal Voyage — Episode 1', educator: 'Carl Sagan', country: 'United States', educator_image: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Carl_Sagan_Planetary_Society.JPG', company: 'PBS', domain: 'pbs.org', country: 'United States', subject: 'Astronomy', source_type: 'archive', source_url: 'https://archive.org/details/cosmos', tags: ['astronomy', 'science', 'history'], year: 1980, description: 'The shores of the cosmic ocean — episode one of Cosmos, streaming free at the Internet Archive.' },
  { title: 'The Essence of Calculus', educator: 'Grant Sanderson', country: 'United States', company: '3Blue1Brown', domain: '3blue1brown.com', country: 'United States', subject: 'Mathematics', source_type: 'youtube', source_url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwPCMYp_DAAA', tags: ['calculus', 'math', 'visualization'], year: 2017, duration_sec: 1020, description: 'Chapter 1 of 3Blue1Brown\'s Essence of Calculus — a visual, intuitive reconstruction of what calculus really is.' },
  { title: 'Introduction: Crash Course World History #1', educator: 'John Green', country: 'United States', company: 'Crash Course', domain: 'thecrashcourse.com', country: 'United States', subject: 'History', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=Yocja_N5s1I', tags: ['history', 'world-history'], year: 2012, duration_sec: 720, description: 'The opening of Crash Course World History — 15 minutes on why history matters, 40,000 years in scope.' },
  { title: 'How to Take Notes in College (Study Skills)', educator: 'Khan Academy', country: 'United States', company: 'Khan Academy', domain: 'khanacademy.org', country: 'United States', subject: 'Study Skills', source_type: 'youtube', source_url: 'https://www.youtube.com/@khanacademy', tags: ['study', 'skills'], description: 'Note-taking and study strategies from the Khan Academy free learning library.' },
  { title: 'Lecture 1: The Machine Learning Summer School opener', educator: 'MIT OpenCourseWare', country: 'United States', company: 'MIT', domain: 'mit.edu', country: 'United States', subject: 'Computer Science', source_type: 'archive', source_url: 'https://archive.org/details/mit_ocw_ai_lectures', tags: ['ai', 'ml', 'mit'], description: 'Classic MIT artificial intelligence lecture material preserved at the Internet Archive.' },
];
console.log('Seeding lectures...');
for (const l of seed) await addLecture(admin.id, l);
console.log('Done.');
process.exit(0);
