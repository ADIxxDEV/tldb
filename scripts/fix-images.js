// one-off: fix educator portrait URLs + sync seed.js
'use strict';
const fs = require('fs');
const { q, init } = require('../server/db');

(async () => {
  await init();
  await q.run(`UPDATE educators SET image_url = ? WHERE slug = 'carl-sagan'`,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Carl_Sagan_Planetary_Society.JPG/440px-Carl_Sagan_Planetary_Society.JPG');
  await q.run(`UPDATE educators SET image_url = ? WHERE slug = 'walter-lewin'`,
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Walter_Lewin_May_16%2C_2011_talk_at_MIT.png/500px-Walter_Lewin_May_16%2C_2011_talk_at_MIT.png');
  const rows = await q.all(`SELECT name, image_url FROM educators WHERE length(image_url) > 0`);
  console.log('educators with images:', rows.map(r => r.name).join(', '));

  let s = fs.readFileSync('server/seed.js', 'utf8');
  s = s.replace(
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Carl_Sagan_planetary_society.jpg/440px-Carl_Sagan_planetary_society.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Carl_Sagan_Planetary_Society.JPG/440px-Carl_Sagan_Planetary_Society.JPG');
  fs.writeFileSync('server/seed.js', s);
  console.log('seed.js synced');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
