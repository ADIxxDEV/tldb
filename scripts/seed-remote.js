// Seed the PRODUCTION TLDB (Cloudflare Workers + D1) through its own API.
// Usage: node scripts/seed-remote.js [base-url] [admin-email] [admin-password]
'use strict';
const BASE = process.argv[2] || 'https://tldb.eapp.workers.dev';
const EMAIL = process.argv[3] || 'admin@tldb.local';
const PASSWORD = process.argv[4] || 'changeme123';

let cookie = '';
async function api(path, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

const seed = [
  { title: 'Lecture 1: Introduction to Algorithms', educator_name: 'MIT OpenCourseWare', company_name: 'MIT', company_domain: 'mit.edu', subject: 'Computer Science', source_type: 'youtube', source_url: 'https://www.youtube.com/playlist?list=PLUl4u3cNGP61Oq3tWYp6V_F-5jb5L2iHb', tags: ['algorithms', 'cs', 'mit'], year: 2020, batch_name: 'MIT 6.006', description: 'MIT 6.006 Introduction to Algorithms — the classic opening lecture covering course logistics and algorithmic thinking.' },
  { title: 'Lecture 0: Scratch — CS50', educator_name: 'David J. Malan', company_name: 'Harvard University', company_domain: 'harvard.edu', subject: 'Computer Science', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=SYqzc0SMOw8', tags: ['cs50', 'cs', 'programming'], year: 2024, batch_name: 'CS50 2024', duration_sec: 9120, description: 'Harvard CS50x opens with computational thinking, Scratch, and the art of programming from zero.' },
  { title: 'Linear Algebra Done Right: Vector Spaces', educator_name: 'Sheldon Axler', subject: 'Mathematics', source_type: 'youtube', source_url: 'https://www.youtube.com/results?search_query=axler+linear+algebra', tags: ['linear-algebra', 'math'], description: 'Abstract vector spaces explained the "done right" way — no determinants required.' },
  { title: '8.01 Lecture 1: Powers of Ten, Units, Dimensions', educator_name: 'Walter Lewin', educator_image_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Walter_Lewin_May_16%2C_2011_talk_at_MIT.png/500px-Walter_Lewin_May_16%2C_2011_talk_at_MIT.png', company_name: 'MIT', company_domain: 'mit.edu', subject: 'Physics', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=wWnfJ0-xXRE', tags: ['physics', 'mechanics', 'mit'], year: 1999, batch_name: 'MIT 8.01', duration_sec: 2820, description: 'The legendary opening lecture of MIT 8.01 Classical Mechanics — measurements, dimensions, and the scale of the universe.' },
  { title: 'Cosmos: A Personal Voyage — Episode 1', educator_name: 'Carl Sagan', educator_image_url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Carl_Sagan_Planetary_Society.JPG', company_name: 'PBS', company_domain: 'pbs.org', subject: 'Astronomy', source_type: 'archive', source_url: 'https://archive.org/details/cosmos', tags: ['astronomy', 'science', 'history'], year: 1980, description: 'The shores of the cosmic ocean — episode one of Cosmos, streaming free at the Internet Archive.' },
  { title: 'The Essence of Calculus', educator_name: 'Grant Sanderson', company_name: '3Blue1Brown', company_domain: '3blue1brown.com', subject: 'Mathematics', source_type: 'youtube', source_url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwPCMYp_DAAA', tags: ['calculus', 'math', 'visualization'], year: 2017, duration_sec: 1020, description: 'Chapter 1 of 3Blue1Brown\'s Essence of Calculus — a visual, intuitive reconstruction of what calculus really is.' },
  { title: 'Introduction: Crash Course World History #1', educator_name: 'John Green', company_name: 'Crash Course', company_domain: 'thecrashcourse.com', subject: 'History', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=Yocja_N5s1I', tags: ['history', 'world-history'], year: 2012, duration_sec: 720, description: 'The opening of Crash Course World History — 15 minutes on why history matters, 40,000 years in scope.' },
  { title: 'How to Take Notes in College (Study Skills)', educator_name: 'Khan Academy', company_name: 'Khan Academy', company_domain: 'khanacademy.org', subject: 'Study Skills', source_type: 'youtube', source_url: 'https://www.youtube.com/@khanacademy', tags: ['study', 'skills'], description: 'Note-taking and study strategies from the Khan Academy free learning library.' },
  { title: 'Lecture 1: The Machine Learning Summer School opener', educator_name: 'MIT OpenCourseWare', company_name: 'MIT', company_domain: 'mit.edu', subject: 'Computer Science', source_type: 'archive', source_url: 'https://archive.org/details/mit_ocw_ai_lectures', tags: ['ai', 'ml', 'mit'], description: 'Classic MIT artificial intelligence lecture material preserved at the Internet Archive.' },
];

const me = await api('/auth/me');
if (!me.user) {
  try {
    const r = await api('/auth/signup', { body: { email: EMAIL, name: 'TLDB Admin', password: PASSWORD } });
    console.log('Admin created:', r.user.email, `(${r.user.role})`);
  } catch (e) {
    await api('/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    console.log('Logged in as existing admin');
  }
} else {
  console.log('Already signed in as', me.user.email);
}

const existing = await api('/lectures');
if (existing.total > 0) { console.log(`Catalog already has ${existing.total} records — skipping seed.`); process.exit(0); }

let id = 0;
for (const l of seed) {
  const sub = await api('/contributions', { body: l });
  const app = await api(`/admin/contributions/${sub.contribution_id}/approve`, { body: {} });
  console.log('  +', app.public_id, l.title);
  id++;
}
// feature the first three
const cat = await api('/admin/lectures');
for (const l of cat.lectures.filter(x => ['LC-000001', 'LC-000002', 'LC-000004'].includes(x.public_id))) {
  await api(`/admin/lectures/${l.id}/feature`, { body: { featured: true } });
}
console.log(`Seeded ${id} records on ${BASE}`);
