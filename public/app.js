/* TLDB frontend core: api, router, home, browse, lecture record */
'use strict';
window.VIEWS = window.VIEWS || {};

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDur = (s) => !s ? '' : `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.floor(s % 3600 / 60)}m`;
const state = { user: null };

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3500);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- top nav ----------
function renderNav() {
  const u = state.user;
  $('#topnav').innerHTML = `
    <a href="#/browse" data-nav="browse">Catalog</a>
    <a href="#/subjects" data-nav="subjects">Subjects</a>
    ${u ? '<a href="#/watchlist" data-nav="watchlist">My list</a><a href="#/contribute" data-nav="contribute">Contribute</a><a href="#/keys" data-nav="keys">API keys</a><a href="#/account" data-nav="account">Account</a>' : ''}
    ${u && (u.role === 'admin' || u.role === 'moderator') ? '<a href="#/admin" data-nav="admin">Admin</a>' : ''}
    ${u
      ? `<span class="who">${esc(u.name)} · ${u.role}</span><a href="#" id="logout">Sign out</a>`
      : '<a href="#/login">Sign in</a><a href="#/signup">Join</a>'}`;
  const logout = $('#logout');
  if (logout) logout.onclick = async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }); state.user = null; renderNav(); location.hash = '#/'; };
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', location.hash.startsWith('#/' + a.dataset.nav)));
}

// ---------- shared renderers ----------
function catalogRows(lectures, showViews = false, quiet = false) {
  if (!lectures.length) return quiet ? '' : '<div class="empty">Nothing catalogued here yet. Be the first to <a href="#/contribute">contribute a record</a>.</div>';
  return `<div class="catalog">` + lectures.map(l => {
    const viewsLabel = showViews === 'month' && l.month_views ? `${l.month_views} views this month`
      : showViews === 'week' && l.week_views ? `${l.week_views} views this week` : '';
    return `
    <div class="row">
      <span class="rid">${esc(l.public_id || 'pending')}</span>
      <div>
        <a class="rtitle" href="#/lecture/${esc(l.slug)}">${esc(l.title)}</a>
        <div class="rmeta">${esc(l.educator_name || 'Unknown educator')}${l.year ? ' · ' + l.year : ''}${l.subject ? ' · ' + esc(l.subject) : ''} · ▲ ${l.likes} ▼ ${l.dislikes}${viewsLabel ? ` · <span class="hot">${viewsLabel}</span>` : ''}${l.hidden ? ' · <span class="badge red">unlisted</span>' : ''}</div>
      </div>
      <span class="rsrc">${esc(l.source_type)}</span>
    </div>`;
  }).join('') + '</div>';
}

// ---------- home (IMDb-style: featured hero, trending, top, educators, companies) ----------
function monogram(name) {
  const words = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]).join('').toUpperCase();
}
function avatar(name, imgUrl, size = 56) {
  const img = imgUrl
    ? `<img src="${esc(imgUrl)}" alt="" width="${size}" height="${size}" loading="lazy"
        onerror="this.replaceWith(document.createTextNode('${esc(monogram(name))}'))">`
    : '';
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.36}px">${img || esc(monogram(name))}</span>`;
}
function logoChip(c) {
  const mono = `<span class="monogram">${esc(monogram(c.name))}</span>`;
  const img = c.domain
    ? `<img src="https://www.google.com/s2/favicons?domain=${esc(c.domain)}&sz=128" alt="" width="44" height="44" loading="lazy"
        onerror="this.remove()">` : '';
  return `<a class="edu-card" href="#/company/${esc(c.slug)}" title="${esc(c.name)}">
    <span class="avatar logo">${mono}${img}</span>
    <span class="edu-name">${esc(c.name)}</span>
    <span class="edu-sub">${c.lectures} lecture${c.lectures === 1 ? '' : 's'}</span></a>`;
}
function batchCard(b) {
  const st = { running: 'Running', ended: 'Ended', upcoming: 'Starts soon' }[b.status] || 'Status unknown';
  const money = b.access === 'free' ? 'Free' : (b.price ? (b.currency === 'INR' ? '₹' : '') + b.price : 'Paid');
  return `<a class="edu-card" href="#/batch/${esc(b.provider)}/${esc(b.external_id)}" title="${esc(b.name)}">
    <span class="edu-name">${esc(b.name)}</span>
    <span class="edu-sub">${esc(b.company_name || b.provider.toUpperCase())} · ${esc(st)} · ${esc(money)}</span>
    <span class="mono muted" style="font-size:11px">${b.lecture_count ? b.lecture_count + ' items' : 'structure only'}</span></a>`;
}
function eduCard(e) {
  return `<a class="edu-card" href="#/educator/${esc(e.slug)}">
    ${avatar(e.name, e.image_url, 56)}
    <span class="edu-name">${esc(e.name)}</span>
    <span class="edu-sub">${e.lectures} lecture${e.lectures === 1 ? '' : 's'} · ▲ ${e.likes}</span></a>`;
}
function courseCard(co) {
  return `<a class="edu-card course-card" href="#/course/${esc(co.slug)}">
    <span class="course-count mono">${co.lecture_count}</span>
    <span class="edu-name">${esc(co.title)}</span>
    <span class="edu-sub">${esc(co.educator_name || 'Unknown educator')}${co.year ? ' · ' + co.year : ''}</span></a>`;
}
function strip(items, renderer) {
  if (!items.length) return '';
  return `<div class="strip">${items.map(renderer).join('')}</div>`;
}

// ---------- skeleton loading placeholders ----------
function skelRow() {
  return `<div class="skel-row"><span class="skel skel-id">&nbsp;</span>
    <div class="skel-main"><div class="skel skel-line">&nbsp;</div><div class="skel skel-line w60">&nbsp;</div></div>
    <span class="skel skel-src">&nbsp;</span></div>`;
}
function skeleton(kind) {
  if (kind === 'home') return `
    <div class="skel-hero"><div>
      <div class="skel skel-line w40">&nbsp;</div><div class="skel skel-title">&nbsp;</div>
      <div class="skel skel-line w80">&nbsp;</div><div class="skel skel-line w60">&nbsp;</div>
      <div class="skel skel-block" style="height:38px;width:170px">&nbsp;</div>
    </div><div class="skel skel-poster">&nbsp;</div></div>
    <div class="skel skel-title" style="width:30%">&nbsp;</div>
    ${skelRow().repeat(4)}`;
  if (kind === 'record') return `
    <div class="skel skel-line w40">&nbsp;</div><div class="skel skel-title">&nbsp;</div>
    <div class="skel-kv">${'<div class="skel skel-line w40">&nbsp;</div><div class="skel skel-line">&nbsp;</div>'.repeat(5)}</div>
    ${skelRow().repeat(2)}`;
  if (kind === 'strip') return `<div class="skel-strip">${'<div class="skel skel-card">&nbsp;</div>'.repeat(5)}</div>`;
  return skelRow().repeat(6);
}

// A catalog with nothing in it should invite one clear action, not show seven empty shelves.
function firstRun(home) {
  const companies = home.companies || [];
  const batches = home.batches || [];
  return `
    <div class="fr-hero">
      <div class="fr-copy">
        <h1>Every lecture, on the record.</h1>
        <p class="fr-lead">TLDB keeps the facts about a lecture — who taught it, who owns it, which
           batch it sits in, and where it lives. The video always stays with its owner.</p>
        <p class="fr-note">The shelves are empty on purpose: a catalogue starts with its first record.</p>
        <div class="fr-actions">
          <a class="btn primary" href="#/contribute">Add the first record</a>
          <a class="btn" href="#/docs">Import with the API</a>
        </div>
      </div>
      <figure class="fr-anatomy" aria-label="What one record contains">
        <span class="rid">LC-000000</span>
        <b>Lecture title</b>
        <dl>
          <dt>Taught by</dt><dd>An educator, with a page of their own</dd>
          <dt>Owned by</dt><dd>${esc(companies[0]?.name || 'The rights holder')}</dd>
          <dt>Batch</dt><dd>${esc(batches[0]?.name || 'The course it was published in')}</dd>
          <dt>Source</dt><dd>The official page — never a copy</dd>
        </dl>
        <figcaption>One record, five facts. That is the whole product.</figcaption>
      </figure>
    </div>
    ${batches.length ? `
      <div class="section-head"><h2>Course structures on file</h2><span class="muted">subject, topic and lecture titles</span></div>
      <div class="card-grid">${batches.map(batchCard).join('')}<a class="edu-card ghost" href="#/contribute"><span class="edu-name">Add another batch</span><span class="edu-sub">through the form or the API</span></a></div>` : ''}
    <div class="section-head"><h2>What a record holds</h2><span class="muted">nothing is copied or hosted</span></div>
    <div class="panel fr-grid">
      <div><h3>Who taught it</h3><p class="muted">The educator, their own page, and everything else of theirs on file.</p></div>
      <div><h3>Who owns it</h3><p class="muted">The rights holder and the batch it was published in — never us.</p></div>
      <div><h3>Where it lives</h3><p class="muted">The official page. Free lectures open there; paid ones lead to that batch's own paywall.</p></div>
    </div>
    <div class="section-head"><h2>Rights holders</h2><span class="muted">${companies.length} on file</span></div>
    ${strip(companies, logoChip) || '<div class="empty">No companies on record yet.</div>'}
    <div class="fr-close">
      <div><b>Ready to put the first lecture on the record?</b>
        <p class="muted">A sign-in, a title, a rights holder and a link is all it takes.</p></div>
      <a class="btn primary" href="#/contribute">Add the first record</a>
    </div>`;
}

VIEWS.home = async (el) => {
  el.innerHTML = skeleton('home');
  const [home, me] = await Promise.all([api('/home'), api('/auth/me')]);
  state.user = me.user; renderNav();
  if (!home.stats.total && !(home.featured || []).length) {
    el.innerHTML = firstRun(home);
    $('#homeSearch') && ($('#homeSearch').onsubmit = (e) => { e.preventDefault(); location.hash = '#/browse?query=' + encodeURIComponent(e.target.q.value.trim()); });
    return;
  }
  const f = home.featured;
  const hero = f.length ? `
    <div class="feature-hero">
      <div class="fh-main">
        <span class="badge gold">Featured today</span>
        <span class="rid">${esc(f[0].public_id)}</span>
        <h1><a href="#/lecture/${esc(f[0].slug)}">${esc(f[0].title)}</a></h1>
        <p class="fh-desc">${esc(f[0].description || '')}</p>
        <div class="fh-meta">Taught by <b>${esc(f[0].educator_name || 'Unknown')}</b>
          ${f[0].company_name ? ` · ${esc(f[0].company_name)}` : ''} · ${esc(f[0].subject || 'General')}</div>
        <div class="actions"><a class="btn primary" href="#/lecture/${esc(f[0].slug)}">Open the record</a></div>
      </div>
      ${f.length > 1 ? `<div class="fh-side">${f.slice(1, 3).map(x => `
        <a class="fh-item" href="#/lecture/${esc(x.slug)}">
          <span class="rid">${esc(x.public_id)}</span>
          <span class="fh-item-title">${esc(x.title)}</span>
          <span class="fh-item-sub">${esc(x.educator_name || '')}</span></a>`).join('')}</div>` : ''}
    </div>` : '';
  el.innerHTML = `
    <div class="hero">
      <h1>Every lecture, on the record.</h1>
      <p>TLDB is an open catalog of lectures and study material — who taught it, who owns it,
         where it lives. Nothing is hosted here; the record points to the source.</p>
      <form class="searchbar" id="homeSearch">
        <input name="q" placeholder="Search the record — try “algorithms”" aria-label="Search lectures">
        <button type="submit">Search</button>
      </form>
      <div class="hero-stats">
        <div class="stat"><b>${home.stats.total}</b><span>lectures on record</span></div>
        <div class="stat"><b>${home.stats.educators}</b><span>educators</span></div>
        <div class="stat"><b>${home.stats.companies}</b><span>companies</span></div>
      </div>
    </div>
    ${hero}
    <div class="section-head"><h2>Trending this week</h2><span class="muted">most-watched in 7 days</span></div>
    ${home.trending.length ? catalogRows(home.trending, 'week') : `<div class="empty">Nothing trending yet — open a few records and they'll show up here.</div>`}
    <div class="section-head"><h2>Top this month</h2><span class="muted">most-watched in 30 days</span></div>
    ${home.monthTop.length ? catalogRows(home.monthTop, 'month') : `<div class="empty">Not enough history yet — check back as the record grows.</div>`}
    <div class="section-head"><h2>Top rated records</h2><a href="#/browse">Full catalog →</a></div>
    ${catalogRows(home.top)}
    <div class="section-head"><h2>Courses & batches</h2><span class="muted">an institute's own course structure</span></div>
    ${(home.batches || []).length ? strip(home.batches, batchCard) : '<div class="empty">No courses yet — a course is a batch or playlist that groups lectures in order.</div>'}
    <div class="section-head"><h2>Top educators</h2></div>
    ${strip(home.educators, eduCard) || '<div class="empty">No educators on record yet.</div>'}
    <div class="section-head"><h2>Major companies</h2></div>
    ${strip(home.companies, logoChip) || '<div class="empty">No companies on record yet.</div>'}
    <div class="section-head"><h2>Browse by subject</h2></div>
    ${home.subjects.length ? `<div class="chips">${home.subjects.map(s =>
      `<a class="chip" href="#/browse?subject=${encodeURIComponent(s.subject)}">${esc(s.subject)} <span class="mono muted">${s.count}</span></a>`).join('')}</div>` : '<div class="empty">No subjects yet — they appear as soon as the first record lands.</div>'}
    <div class="section-head"><h2>Recently catalogued</h2></div>
    ${catalogRows(home.recent)}`;
  $('#homeSearch').onsubmit = (e) => { e.preventDefault(); location.hash = '#/browse?query=' + encodeURIComponent(e.target.q.value.trim()); };
};

// ---------- browse ----------
const SORT_LABELS = { new: 'Newest first', top: 'Top rated', views: 'Most viewed all-time', trending: 'Trending this week', month: 'Top this month', az: 'Title A–Z' };

VIEWS.browse = async (el, params, query) => {
  const q = query.get('query') || query.get('q') || '';
  const cur = {
    sort: query.get('sort') || 'new',
    subject: query.get('subject') || '',
    country: query.get('country') || '',
    language: query.get('language') || '',
    batch: query.get('batch') || '',
    access: query.get('access') || '',
    provider: query.get('provider') || '',
    source: query.get('source') || '',
    educator: query.get('educator') || '',
  };
  const page = Number(query.get('page') || 1);
  el.innerHTML = skeleton('rows');
  const [data, meta] = await Promise.all([
    api('/lectures?' + new URLSearchParams({ query: q, ...cur, page }).toString()),
    api('/meta'),
  ]);
  const buildHash = (over) => {
    const p = new URLSearchParams();
    const merged = { query: q, ...cur, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && k !== 'page') p.set(k, v);
    return '#/browse' + (p.toString() ? '?' + p.toString() : '');
  };
  const sel = (id, label, options, current) => `
    <select class="plain filter" id="${id}" aria-label="${label}">
      <option value="">${label}</option>
      ${options.map(o => `<option value="${esc(o.v)}" ${String(o.v) === current ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}
    </select>`;
  const heading = q ? `Results for “${esc(q)}”` : cur.subject ? `${esc(cur.subject)} records` : cur.educator ? 'Educator records' : cur.batch ? `${esc(cur.batch)} records` : cur.country ? `Records from ${esc(cur.country)}` : 'The catalog';
  const hasFilters = Object.entries(cur).some(([k, v]) => k !== 'sort' && v);
  if (!data.total && !hasFilters && !q) {
    // an empty catalog should read as an invitation, not a broken filter bar
    el.innerHTML = `
      <div class="section-head" style="margin-top:0"><h1>${heading}</h1></div>
      <form class="searchbar" id="browseSearch" style="margin:18px 0 10px;max-width:480px">
        <input name="q" value="${esc(q)}" placeholder="Search titles, descriptions, tags" aria-label="Search lectures">
        <button type="submit">Search</button>
      </form>
      <div class="empty" style="padding:48px 0">
        <p><b>No records yet.</b> The catalog opens with its first contribution — a lecture, a name, a rights holder and a link to the source.</p>
        <div class="actions" style="justify-content:center;margin-top:16px">
          <a class="btn primary" href="#/contribute">Add the first record</a>
          <a class="btn" href="#/docs">Import with the API</a>
        </div>
      </div>`;
    $('#browseSearch').onsubmit = (e) => { e.preventDefault(); location.hash = '#/browse?query=' + encodeURIComponent(e.target.q.value.trim()); };
    return;
  }
  el.innerHTML = `
    <div class="section-head" style="margin-top:0">
      <h1>${heading}</h1>
      <span class="muted">${data.total} record${data.total === 1 ? '' : 's'}${data.fuzzy ? ' · closest matches' : ''}</span>
    </div>
    ${data.corrected ? `<p class="search-hint">Nothing matched “${esc(q)}” exactly — showing results for
      <a href="#/browse?query=${encodeURIComponent(data.corrected)}">${esc(data.corrected)}</a>.</p>` : ''}
    <form class="searchbar" id="browseSearch" style="margin:18px 0 10px;max-width:480px">
      <input name="q" value="${esc(q)}" placeholder="Search titles, descriptions, tags" aria-label="Search lectures">
      <button type="submit">Search</button>
    </form>
    <div class="filterbar">
      ${sel('fSort', 'Sort by…', Object.entries(SORT_LABELS).map(([v, t]) => ({ v, t })), cur.sort)}
      ${sel('fCountry', 'Any country', meta.countries.map(x => ({ v: x, t: x })), cur.country)}
      ${sel('fLanguage', 'Any language', meta.languages.map(x => ({ v: x.language, t: `${x.language} (${x.count})` })), cur.language)}
      ${sel('fSubject', 'Any subject', meta.subjects.map(x => ({ v: x.subject, t: `${x.subject} (${x.count})` })), cur.subject)}
      ${sel('fBatch', 'Any batch', meta.batches.map(x => ({ v: x.batch_name, t: `${x.batch_name} (${x.count})` })), cur.batch)}
      ${sel('fAccess', 'Free or paid', [{ v: 'free', t: 'Free' }, { v: 'paid', t: 'Paid' }], cur.access)}
      ${meta.providers && meta.providers.length ? sel('fProvider', 'Any provider', meta.providers.map(x => ({ v: x.provider, t: `${x.provider.toUpperCase()} (${x.count})` })), cur.provider) : ''}
      ${sel('fSource', 'Any source', ['youtube', 'archive', 'torrent', 'file', 'stream', 'other'].map(x => ({ v: x, t: x })), cur.source)}
      ${Object.values(cur).some(Boolean) ? '<a class="btn small" href="' + buildHash(Object.fromEntries(Object.keys(cur).map(k => [k, '']))) + '">Clear filters</a>' : ''}
    </div>
    ${!data.total && q ? `<div class="empty" id="treeHint" style="padding:26px 0">
        <p class="muted">No catalogued records match “${esc(q)}”.</p></div>` : ''}
    ${catalogRows(data.lectures, false, !!q)}
    ${data.pages > 1 ? `<div class="actions" style="margin-top:22px">
      ${page > 1 ? `<a class="btn" href="${buildHash({})}&page=${page - 1}">← Newer</a>` : ''}
      ${page < data.pages ? `<a class="btn" href="${buildHash({})}&page=${page + 1}">Older →</a>` : ''}
    </div>` : ''}`;
  $('#browseSearch').onsubmit = (e) => { e.preventDefault(); location.hash = '#/browse?query=' + encodeURIComponent(e.target.q.value.trim()); };
  if (!data.total && q) {
    api('/suggest?q=' + encodeURIComponent(q)).then(sug => {
      const hits = (sug.items || []).filter(i => i.type === 'topic' || i.type === 'batch');
      const box = $('#treeHint');
      if (!box) return;
      if (!hits.length) {
        box.innerHTML = `<p class="muted">Nothing catalogued for this phrase yet — <a href="#/contribute">add the record</a> or try a shorter word.</p>`;
        return;
      }
      box.innerHTML = `<p class="muted" style="margin-bottom:10px">But the phrase does appear in the course structures:</p>
        <div class="actions">${hits.map(i => `<a class="btn" href="${i.href}">${esc(i.label)} <span class="muted">· ${esc(i.sub)}</span></a>`).join('')}</div>`;
    }).catch(() => {});
  }
  const apply = (key, value) => { location.hash = buildHash({ [key]: value }); };
  [['fSort', 'sort'], ['fCountry', 'country'], ['fLanguage', 'language'], ['fSubject', 'subject'], ['fBatch', 'batch'], ['fAccess', 'access'], ['fProvider', 'provider'], ['fSource', 'source']].forEach(([id, key]) => {
    const node = $('#' + id);
    if (node) node.onchange = (e) => apply(key, e.target.value);
  });
};

// ---------- lecture record ----------
VIEWS.lecture = async (el, params) => {
  let data;
  el.innerHTML = skeleton('record');
  try { data = await api('/lectures/' + encodeURIComponent(params.slug)); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}. <a href="#/browse">Back to the catalog</a>.</div>`; return; }
  const l = data.lecture;
  const srcLabel = { youtube: 'YouTube', archive: 'Internet Archive', torrent: 'Torrent / magnet', file: 'Direct file', stream: 'Stream (HLS/DASH)', other: 'Other source' }[l.source_type] || l.source_type;
  el.innerHTML = `
    <div class="record">
      <div class="record-head">
        <span class="rid">${esc(l.public_id)}</span>
        <h1>${esc(l.title)}</h1>
        <div class="meta">
          Taught by <a href="#/educator/${esc(l.educator_slug || '')}"><b>${esc(l.educator_name || 'Unknown')}</b></a>
          ${l.company_name ? ` · <a href="#/company/${esc(l.company_slug)}">${esc(l.company_name)}</a>` : ''}
          ${l.year ? ` · <span class="mono">${l.year}</span>` : ''} · ${fmtDur(l.duration_sec) || 'duration unknown'}
          ${l.source_status === 'dead' ? ' · <span class="badge red">source reported dead</span>' : ''}
        </div>
      </div>
      <div class="record-body">
        <p>${esc(l.description || 'No description on record yet.')}</p>
        <dl class="kv">
          <dt>source</dt><dd><span class="badge gold">${esc(srcLabel)}</span></dd>
          ${l.provider ? `<dt>provider</dt><dd><span class="badge">${esc(l.provider.toUpperCase())}</span>${l.external_id ? ` <span class="mono muted">video id ${esc(l.external_id)}</span>` : ''}${l.batch_id ? ` <span class="mono muted">· batch id ${esc(l.batch_id)}</span>` : ''}${l.subject_id ? ` <span class="mono muted">· subject ${esc(l.subject_id)}</span>` : ''}${l.topic_id ? ` <span class="mono muted">· topic ${esc(l.topic_id)}</span>` : ''}</dd>` : ''}
          <dt>access</dt><dd>${l.access === 'paid'
            ? `<span class="badge red">Paid</span>${l.purchase_url ? ` <a href="${esc(l.purchase_url)}" target="_blank" rel="noopener">Buy from the rights holder ↗</a>` : ' — buy from the rights holder'}`
            : `<span class="badge sage">Free to watch</span>`}</dd>
          <dt>location</dt><dd><a href="${esc(l.source_url)}" target="_blank" rel="noopener">${esc(l.source_url)}</a></dd>
          <dt>rights</dt><dd>${esc(l.rights_holder || 'On record: unspecified')}${l.company_name ? ` (${esc(l.company_name)})` : ''}</dd>
          <dt>subject</dt><dd>${esc(l.subject || '—')}</dd>
          ${l.batch_name ? `<dt>batch</dt><dd><a href="#/browse?batch=${encodeURIComponent(l.batch_name)}">${esc(l.batch_name)}</a></dd>` : ''}
          <dt>language</dt><dd>${esc(l.language)}</dd>
          <dt>country</dt><dd>${esc(l.educator_country || l.company_country || '—')}</dd>
          <dt>record</dt><dd class="mono">${esc(l.public_id)} · added ${esc((l.published_at || '').slice(0, 10))} · ${l.views} views</dd>
        </dl>
        ${l.tags.length ? `<div>${l.tags.map(t => `<a class="tag" href="#/browse?query=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        ${(() => {
          const total = l.likes + l.dislikes;
          if (!total) return '';
          const pct = Math.round(l.likes * 100 / total);
          return `<div class="ratio" title="${pct}% of voters liked this"><div class="ratio-bar"><span style="width:${pct}%"></span></div><span class="mono muted">${pct}% liked · ${total} vote${total === 1 ? '' : 's'}</span></div>`;
        })()}
        <div class="actions">
          ${l.access === 'paid'
            ? `<a class="btn primary" href="${esc(l.purchase_url || l.source_url)}" target="_blank" rel="noopener">Buy / unlock at source ↗</a>`
            : `<a class="btn primary" href="${esc(l.source_url)}" target="_blank" rel="noopener">Open at source ↗</a>`}
          <button class="btn" id="saveBtn">${data.saved ? '★ Saved' : '☆ Save to my list'}</button>
          <button class="btn" id="likeBtn">▲ Like <span class="vote muted">${l.likes}</span></button>
          <button class="btn" id="dislikeBtn">▼ Dislike <span class="vote muted">${l.dislikes}</span></button>
          <button class="btn danger" id="deadBtn" title="Report this link as not working">Link not working?</button>
          <button class="btn" id="citeBtn" title="Copy a citation for this record">Cite</button>
        </div>
        ${data.course ? `<div class="notice" style="margin-top:18px">Part of the course <a href="#/course/${esc(data.course.slug)}"><b>${esc(data.course.title)}</b></a>${l.position ? ` — lecture ${l.position}` : ''}</div>` : ''}
      </div>
    </div>
    <div class="comments">
      <div class="section-head"><h2>Notes on this record</h2><span class="muted">${data.comments.length}</span></div>
      ${state.user ? `<form id="commentForm"><textarea placeholder="Add a note — what did you think, is the source still live?" maxlength="2000"></textarea><button class="btn small" type="submit">Post note</button></form>` : `<div class="empty"><a href="#/login">Sign in</a> to leave a note.</div>`}
      <div id="commentList">${data.comments.map(c => `
        <div class="comment"><div class="cmeta">${esc(c.author)} · ${esc(c.created_at)}</div>${esc(c.body)}</div>`).join('') || '<div class="empty">No notes yet.</div>'}</div>
    </div>
    ${data.related.length ? `
    <div class="section-head"><h2>More like this</h2></div>
    ${catalogRows(data.related)}` : ''}
    ${feedbackBox('lecture', l.slug)}`;

  const vote = async (value) => {
    if (!state.user) return toast('Sign in to vote', true);
    try {
      const r = await api(`/lectures/${encodeURIComponent(l.slug)}/vote`, { method: 'POST', body: { value } });
      $('#likeBtn .vote').textContent = r.likes; $('#dislikeBtn .vote').textContent = r.dislikes;
    } catch (e) { toast(e.message, true); }
  };
  $('#likeBtn').onclick = () => vote(1);
  $('#dislikeBtn').onclick = () => vote(-1);
  $('#deadBtn').onclick = async () => {
    if (!state.user) return toast('Sign in to report a dead link', true);
    try {
      await api('/feedback', { method: 'POST', body: { type: 'report', message: `The source link for "${l.title}" (${l.public_id}) is not working.` } });
      toast('Reported — an admin will check the link');
    } catch (e) { toast(e.message, true); }
  };
  $('#citeBtn').onclick = async () => {
    const cite = `${l.educator_name || 'Unknown educator'} (${l.year || 'n.d.'}). ${l.title}. TLDB record ${l.public_id}. ${location.origin}/#/lecture/${l.slug}`;
    try { await navigator.clipboard.writeText(cite); toast('Citation copied'); }
    catch { toast('Copy failed — select it manually', true); }
  };
  $('#saveBtn').onclick = async () => {
    if (!state.user) return toast('Sign in to save lectures', true);
    try {
      const r = await api(`/lectures/${encodeURIComponent(l.slug)}/save`, { method: 'POST' });
      $('#saveBtn').textContent = r.saved ? '★ Saved' : '☆ Save to my list';
      toast(r.saved ? 'Added to your list' : 'Removed from your list');
    } catch (e) { toast(e.message, true); }
  };
  const cf = $('#commentForm');
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/lectures/${encodeURIComponent(l.slug)}/comments`, { method: 'POST', body: { body: e.target.querySelector('textarea').value } });
      VIEWS.lecture(el, params);
    } catch (err) { toast(err.message, true); }
  };
  bindFeedback('lecture', l.slug);
};

// ---------- shared feedback box (lecture / educator / company pages) ----------
function feedbackBox(kind, slug) {
  if (!state.user) return `<div class="fb-box"><b>Spot a problem?</b> <a href="#/login">Sign in</a> to report an issue or suggest an edit.</div>`;
  return `<div class="fb-box">
    <b>Spot a problem?</b> Report an issue or suggest an edit — an admin reviews every note.
    <form id="fbForm" class="stack">
      <select class="plain" id="fbType">
        <option value="report">Report an issue (dead link, wrong info, rights concern)</option>
        <option value="edit">Suggest an edit (title, educator, tags…)</option>
        <option value="other">Something else</option>
      </select>
      <textarea id="fbMsg" placeholder="Tell us what's wrong or what to change…" maxlength="2000" required></textarea>
      <button class="btn small" type="submit">Send to the review desk</button>
    </form>
  </div>`;
}
function bindFeedback(kind, slug) {
  const f = $('#fbForm');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/feedback', { method: 'POST', body: { type: $('#fbType').value, message: $('#fbMsg').value, [kind + '_slug']: slug } });
      toast(r.status); f.reset();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- course / playlist page (numbered like episodes) ----------
VIEWS.course = async (el, params) => {
  let data;
  el.innerHTML = skeleton('record');
  try { data = await api('/courses/' + encodeURIComponent(params.slug)); }
  catch (e) { VIEWS.notfound(el); return; }
  const co = data.course;
  el.innerHTML = `
    <div class="record">
      <div class="record-head">
        <span class="rid mono muted">course / playlist</span>
        <h1>${esc(co.title)}</h1>
        <div class="meta">
          ${co.educator_name ? `Taught by <a href="#/educator/${esc(co.educator_slug)}"><b>${esc(co.educator_name)}</b></a>` : ''}
          ${co.company_name ? ` · ${esc(co.company_name)}` : ''}
          ${co.year ? ` · ${co.year}` : ''} · ${data.lectures.length} lecture${data.lectures.length === 1 ? '' : 's'}
        </div>
      </div>
      <div class="record-body">
        ${co.description ? `<p>${esc(co.description)}</p>` : ''}
        ${co.subject ? `<dl class="kv"><dt>subject</dt><dd>${esc(co.subject)}</dd></dl>` : ''}
      </div>
    </div>
    <div class="section-head"><h2>Lectures in order</h2></div>
    ${data.lectures.length ? `<div class="catalog">` + data.lectures.map((l, i) => `
      <div class="row">
        <span class="rid">E${i + 1}</span>
        <div>
          <a class="rtitle" href="#/lecture/${esc(l.slug)}">${esc(l.title)}</a>
          <div class="rmeta">${esc(l.public_id)} · ${fmtDur(l.duration_sec) || 'duration unknown'} · ▲ ${l.likes}${l.source_status === 'dead' ? ' · <span class="badge red">source reported dead</span>' : ''}</div>
        </div>
        <span class="rsrc">${esc(l.source_type)}</span>
      </div>`).join('') + '</div>' : '<div class="empty">No lectures assigned to this course yet.</div>'}
    ${feedbackBox('lecture', '')}`;
  bindFeedback('course', co.slug);
};

// ---------- 404 / 403 ----------
VIEWS.notfound = (el) => {
  el.innerHTML = `
    <div class="errpage">
      <span class="rid">HTTP 404</span>
      <h1>Not on the record.</h1>
      <p>The page or record you're looking for doesn't exist — it may have been removed
         or the address is wrong.</p>
      <div class="actions">
        <a class="btn primary" href="#/">Back to the record</a>
        <a class="btn" href="#/browse">Browse the catalog</a>
      </div>
    </div>`;
};
VIEWS.forbidden = (el) => {
  el.innerHTML = `
    <div class="errpage">
      <span class="rid">HTTP 403</span>
      <h1>Not your desk.</h1>
      <p>This area is restricted. If you believe you should have access,
         sign in with the right account or apply to contribute.</p>
      <div class="actions">
        <a class="btn primary" href="#/login">Sign in</a>
        <a class="btn" href="#/apply">Apply as contributor</a>
      </div>
    </div>`;
};

// ---------- search type-ahead ----------
// Every search input gets live suggestions: forgiving matching is done server-side,
// so a half-typed or misspelled word still surfaces the record it was meant for.
function highlight(text, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  let out = esc(text);
  for (const w of words) {
    const safe = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(${safe})`, 'ig'), '<mark>$1</mark>');
  }
  return out;
}

const SUG_ICON = { lecture: '▶', batch: '◈', educator: '✎', company: '▤', subject: '≡', topic: '↳' };

function attachTypeahead(input) {
  if (!input || input.dataset.typeahead) return;
  input.dataset.typeahead = '1';
  const field = document.createElement('div');
  field.className = 'search-field';
  input.parentNode.insertBefore(field, input);
  field.appendChild(input);
  const panel = document.createElement('div');
  panel.className = 'suggest';
  panel.setAttribute('role', 'listbox');
  panel.id = (input.id || 'search') + '-suggest';
  panel.hidden = true;
  field.appendChild(panel);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', panel.id);
  input.setAttribute('aria-expanded', 'false');

  let items = [], active = -1, timer = null;

  const close = () => { panel.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const paint = (data, q) => {
    items = data.items || [];
    if (!items.length && !data.corrected) { close(); return; }
    const rows = items.map((it, i) => `
      <a class="sug" role="option" id="${panel.id}-${i}" href="${it.href}" data-i="${i}">
        <span class="sug-type" aria-hidden="true">${SUG_ICON[it.type] || '·'}</span>
        <span class="sug-main"><span class="sug-label">${highlight(it.label, q)}</span>
          <span class="sug-sub">${esc(it.sub || it.type)}</span></span>
      </a>`).join('');
    const hint = data.corrected
      ? `<div class="sug-hint">No exact match — did you mean <button type="button" class="sug-fix" data-fix="${esc(data.corrected)}">${esc(data.corrected)}</button>?</div>`
      : '';
    panel.innerHTML = rows + hint;
    panel.querySelectorAll('[data-fix]').forEach(b => {
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => {
        input.value = b.dataset.fix;
        if (input.form && input.form.requestSubmit) input.form.requestSubmit();
        else if (input.form) input.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        close();
      };
    });
    open();
  };

  const ask = (q) => {
    if (q.length < 2) { close(); return; }
    fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (input.value.trim() === q) paint(d, q); })
      .catch(() => close());
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    timer = setTimeout(() => ask(q), 110);
  });

  const move = (delta) => {
    if (panel.hidden) { ask(input.value.trim()); return; }
    const opts = [...panel.querySelectorAll('.sug')];
    if (!opts.length) return;
    active = (active + delta + opts.length) % opts.length;
    opts.forEach((o, i) => {
      const on = i === active;
      o.classList.toggle('active', on);
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { o.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', o.id); }
    });
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter') {
      const opts = [...panel.querySelectorAll('.sug')];
      if (!panel.hidden && opts[active >= 0 ? active : 0]) {
        // first Enter opens the top hit, so a typo still gets you where you meant to go
        e.preventDefault();
        location.hash = opts[active >= 0 ? active : 0].getAttribute('href');
        close();
      }
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) ask(input.value.trim()); });
}

// ---------- custom select (a native <select> looks wrong in this theme) ----------
const CHEVRON = '<svg class="select-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

function upgradeSelect(sel) {
  if (!sel || sel.dataset.upgraded) return;
  sel.dataset.upgraded = '1';
  const opts = [...sel.options].map(o => ({ v: o.value, t: o.textContent }));
  const box = document.createElement('div');
  box.className = 'select';
  box.innerHTML = `<button type="button" class="select-btn" aria-haspopup="listbox" aria-expanded="false">
      <span class="select-label"></span>${CHEVRON}</button>
    <div class="select-menu" role="listbox" hidden></div>`;
  sel.classList.add('select-native');
  sel.after(box);
  const btn = box.querySelector('.select-btn');
  const label = box.querySelector('.select-label');
  const menu = box.querySelector('.select-menu');
  const syncLabel = () => {
    const hit = opts.find(o => o.v === sel.value);
    label.textContent = hit && hit.v !== '' ? hit.t : (opts[0]?.t || 'Any');
    box.classList.toggle('is-set', sel.value !== '');
  };
  const paint = () => {
    menu.innerHTML = opts.map((o, i) => `<button type="button" class="select-item" role="option"
        data-i="${i}" aria-selected="${o.v === sel.value ? 'true' : 'false'}">
        <span>${esc(o.t)}</span>${o.v === sel.value ? '<span class="tick" aria-hidden="true">✓</span>' : ''}</button>`).join('');
  };
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); box.classList.remove('open'); };
  const open = () => {
    paint(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); box.classList.add('open');
    const cur = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.select-item');
    if (cur) cur.focus();
  };
  btn.onclick = () => (menu.hidden ? open() : close());
  btn.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };
  menu.onclick = (e) => {
    const item = e.target.closest('.select-item');
    if (!item) return;
    const o = opts[Number(item.dataset.i)];
    sel.value = o.v;
    syncLabel(); close();
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  menu.onkeydown = (e) => {
    const list = [...menu.querySelectorAll('.select-item')];
    const at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[at + 1] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[at - 1] || list[list.length - 1]).focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); btn.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (document.activeElement !== btn) document.activeElement.click(); }
  };
  box.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  syncLabel();
  sel.addEventListener('change', syncLabel);
}

function upgradeSelects(root = document) {
  root.querySelectorAll('select.plain').forEach(upgradeSelect);
}

document.addEventListener('mousedown', (e) => {
  document.querySelectorAll('.select.open').forEach(box => {
    if (!box.contains(e.target)) {
      box.classList.remove('open');
      box.querySelector('.select-menu').hidden = true;
      box.querySelector('.select-btn').setAttribute('aria-expanded', 'false');
    }
  });
});

// ---------- router ----------

async function route() {
  const el = $('#app');
  const hash = location.hash || '#/';
  const [path, qs] = hash.slice(2).split('?');
  const query = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  const view = VIEWS[name];
  el.innerHTML = '<div class="empty">Loading…</div>';
  if (!view) { VIEWS.notfound(el); renderNav(); return; }
  try {
    await view(el, { slug: parts[1], id: parts[2] || parts[1] }, query);
    el.querySelectorAll('input[name="q"]').forEach(attachTypeahead);
    upgradeSelects(el);
  }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  const TITLES = { home: 'The Lecture Database', browse: 'Catalog', lecture: 'Record', batch: 'Batch', course: 'Course',
    subjects: 'Subjects', educator: 'Educator', company: 'Rights holder', docs: 'API', contribute: 'Contribute',
    admin: 'Admin', account: 'Account', keys: 'API keys', login: 'Sign in', signup: 'Join', apply: 'Become a contributor',
    watchlist: 'My list', notfound: 'Not found', forbidden: 'Not allowed' };
  const label = TITLES[name] || 'TLDB';
  document.title = name === 'home' ? 'TLDB — The Lecture Database' : `${label} — TLDB`;
  renderNav();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  route(); // render immediately — views show skeleton placeholders while data loads
  api('/auth/me').then(r => { state.user = r.user; renderNav(); }).catch(() => {});
});
