/* TLDB pages: educator, company, watchlist, subjects, API docs */
'use strict';

// ---------- educator page (like an IMDb name page) ----------
VIEWS.educator = async (el, params) => {
  let data;
  try { data = await api('/educators/' + encodeURIComponent(params.slug)); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}. <a href="#/">Back to the record</a>.</div>`; return; }
  const e = data.educator;
  const likes = data.lectures.reduce((a, l) => a + (l.likes || 0), 0);
  el.innerHTML = `
    <div class="record">
      <div class="record-head" style="display:flex;gap:20px;align-items:center">
        ${avatar(e.name, e.image_url, 72)}
        <div>
          <span class="rid mono muted">educator</span>
          <h1>${esc(e.name)}</h1>
          <div class="meta">${data.lectures.length} lecture${data.lectures.length === 1 ? '' : 's'} on record · ▲ ${likes} likes</div>
        </div>
      </div>
      <div class="record-body">
        ${e.bio ? `<p>${esc(e.bio)}</p>` : ''}
        <dl class="kv">
          ${e.country ? `<dt>country</dt><dd>${esc(e.country)}</dd>` : ''}
          ${e.url ? `<dt>link</dt><dd><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a></dd>` : ''}
        </dl>
      </div>
    </div>
    <div class="section-head"><h2>Lectures on record</h2></div>
    ${catalogRows(data.lectures)}
    ${feedbackBox('educator', e.slug)}`;
  bindFeedback('educator', e.slug);
};

// ---------- company page ----------
VIEWS.company = async (el, params) => {
  let data;
  try { data = await api('/companies/' + encodeURIComponent(params.slug)); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}. <a href="#/">Back to the record</a>.</div>`; return; }
  const co = data.company;
  el.innerHTML = `
    <div class="record">
      <div class="record-head" style="display:flex;gap:20px;align-items:center">
        <span class="avatar logo" style="width:72px;height:72px">
          ${co.domain ? `<img src="https://www.google.com/s2/favicons?domain=${esc(co.domain)}&sz=128" alt="" width="72" height="72" onerror="this.remove()">` : `<span class="monogram" style="font-size:26px">${esc(monogram(co.name))}</span>`}
        </span>
        <div>
          <span class="rid mono muted">${esc(co.kind || 'company')}</span>
          <h1>${esc(co.name)}</h1>
          <div class="meta">${data.lectures.length} lecture${data.lectures.length === 1 ? '' : 's'} on record</div>
        </div>
      </div>
      <div class="record-body">
        <dl class="kv">
          ${co.domain ? `<dt>domain</dt><dd><a href="https://${esc(co.domain)}" target="_blank" rel="noopener">${esc(co.domain)}</a></dd>` : ''}
          ${co.country ? `<dt>country</dt><dd>${esc(co.country)}</dd>` : ''}
        </dl>
      </div>
    </div>
    <div class="section-head"><h2>Lectures on record</h2></div>
    ${catalogRows(data.lectures)}
    ${feedbackBox('company', co.slug)}`;
  bindFeedback('company', co.slug);
};

// ---------- watchlist ----------
VIEWS.watchlist = async (el) => {
  if (!state.user) { el.innerHTML = `<div class="empty"><a href="#/login">Sign in</a> to build your list.</div>`; return; }
  const data = await api('/watchlist');
  el.innerHTML = `
    <div class="section-head" style="margin-top:0"><h2>My list</h2><span class="muted">${data.lectures.length} saved</span></div>
    ${catalogRows(data.lectures)}`;
};

// ---------- subjects ----------
VIEWS.subjects = async (el) => {
  const home = await api('/home');
  el.innerHTML = `
    <div class="section-head" style="margin-top:0"><h2>Subjects</h2><span class="muted">${home.subjects.length} on record</span></div>
    ${home.subjects.length ? `<div class="chips big">${home.subjects.map(s =>
      `<a class="chip" href="#/browse?subject=${encodeURIComponent(s.subject)}">${esc(s.subject)} <span class="mono muted">${s.count}</span></a>`).join('')}</div>`
      : '<div class="empty">No subjects yet.</div>'}`;
};

// ---------- contributor application page ----------
VIEWS.apply = async (el) => {
  const me = state.user;
  if (me && me.role !== 'student') {
    el.innerHTML = `
      <div class="panel" style="max-width:640px;margin:30px auto">
        <h2>You're already a contributor</h2>
        <p class="muted" style="max-width:55ch">Your account has <b>${esc(me.role)}</b> access. Head to the
        <a href="#/contribute">contribution panel</a> to add records, and create your
        <a href="#/keys">API key</a> to use the public API from your own tools.</p>
        <div class="actions"><a class="btn primary" href="#/contribute">Open the contribution panel</a>
        <a class="btn" href="#/keys">Create an API key</a></div>
      </div>`;
    return;
  }
  let pending = null;
  if (me) {
    const mine = await api('/contributions/mine').catch(() => ({ contributions: [] }));
    pending = mine.contributions.find(c => c.action === 'request_contributor' && c.status === 'pending');
  }
  el.innerHTML = `
    <div class="panel" style="max-width:640px;margin:30px auto">
      <span class="badge gold">contributor program</span>
      <h1 style="margin:12px 0 8px">Become a TLDB contributor</h1>
      <p class="muted" style="max-width:60ch">Contributors keep the record accurate. You add lectures you know —
      from your own batches, educators you follow, or free sources you've verified — and admins review
      every submission before it goes on the record.</p>
      <table class="grid" style="margin:16px 0">
        <tr><th>You can</th><th>You can't</th></tr>
        <tr><td>Add lecture records with source links (YouTube, Internet Archive, torrents, files, streams)</td><td>Upload or host any video on TLDB</td></tr>
        <tr><td>Group lectures into courses / playlists</td><td>Add pirated content or misattribute rights</td></tr>
        <tr><td>Get a read/write API key for your own study tools</td><td>Approve your own submissions (admins do that)</td></tr>
      </table>
      ${!me ? `<div class="notice"><a href="#/login">Sign in</a> or <a href="#/signup">create an account</a> first — then apply here.</div>
               <a class="btn primary" href="#/signup">Create an account</a>`
      : pending ? `<div class="notice">Your application is <b>pending review</b>. An admin will approve it soon — you'll get contributor access and can create your API key right after.</div>`
      : `<form id="applyForm" class="stack">
          <label class="f" for="an">Tell the admins about yourself</label>
          <textarea id="an" placeholder="What do you study? Which educators/batches do you follow? Why do you want to contribute?"></textarea>
          <button class="btn primary" type="submit">Apply for contributor access</button>
        </form>`}
    </div>`;
  const af = $('#applyForm');
  if (af) af.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/request-contributor', { method: 'POST', body: { note: $('#an').value } });
      toast('Application sent — an admin will review it');
      VIEWS.apply(el);
    } catch (err) { toast(err.message, true); }
  };
};

// ---------- API docs ----------
VIEWS.docs = async (el) => {
  el.innerHTML = `
    <div class="panel"><h2>TLDB public API</h2>
      <p class="muted" style="max-width:65ch">A keyed read API over everything in the record — built for Lectrio and
      any student tool. Create a key in <a href="#/keys">API keys</a>, then send it as the
      <code class="mono">X-API-Key</code> header. Limit: 120 requests/min per key.</p>
      <table class="grid">
        <tr><th>Endpoint</th><th>What it returns</th></tr>
        <tr><td class="mono">GET /v1/lectures</td><td>Search the catalog — params: <span class="mono">query, subject, educator, source, page, per</span> (per ≤ 100)</td></tr>
        <tr><td class="mono">GET /v1/lectures/:id</td><td>One record by public ID, e.g. <span class="mono">LC-000001</span></td></tr>
        <tr><td class="mono">GET /v1/educators</td><td>All educators with lecture counts</td></tr>
        <tr><td class="mono">GET /v1/companies</td><td>All companies / rights holders with counts</td></tr>
        <tr><td class="mono">GET /api/health</td><td>Service health check (no key needed)</td></tr>
      </table>
      <div class="notice">Example — search the record:<div class="keyreveal">curl -H "X-API-Key: tldb_…" https://YOUR-DOMAIN/v1/lectures?query=algorithms</div></div>
      <div class="notice">Every record carries its <b>source</b> (YouTube, Internet Archive, torrent/magnet, file, stream)
      and <b>rights holder</b>. TLDB hosts nothing — clients resolve and play from the source.</div>
    </div>`;
};
