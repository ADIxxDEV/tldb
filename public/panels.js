/* TLDB panels: auth, contribute, API keys, admin */
'use strict';

// ---------- auth ----------
VIEWS.login = async (el) => {
  el.innerHTML = `<div class="auth"><div class="panel">
    <h1>Sign in</h1><div class="sub">To vote, comment, contribute and manage keys.</div>
    <form id="f" class="stack">
      <label class="f" for="em">Email</label><input class="plain" id="em" name="email" type="email" required>
      <label class="f" for="pw">Password</label><input class="plain" id="pw" name="password" type="password" required>
      <button class="btn primary" type="submit">Sign in</button>
    </form>
    <p class="muted" style="font-size:13px">No account? <a href="#/signup">Join TLDB</a>.</p>
  </div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } });
      state.user = r.user; toast('Signed in'); location.hash = '#/';
    } catch (err) { toast(err.message, true); }
  };
};

VIEWS.signup = async (el) => {
  el.innerHTML = `<div class="auth"><div class="panel">
    <h1>Join TLDB</h1><div class="sub">Students start here. Contributor access is granted after a quick review.</div>
    <form id="f" class="stack">
      <label class="f" for="nm">Name</label><input class="plain" id="nm" name="name" required>
      <label class="f" for="em">Email</label><input class="plain" id="em" name="email" type="email" required>
      <label class="f" for="pw">Password (8+ characters)</label><input class="plain" id="pw" name="password" type="password" minlength="8" required>
      <button class="btn primary" type="submit">Create account</button>
    </form>
    <p class="muted" style="font-size:13px">Already registered? <a href="#/login">Sign in</a>.</p>
  </div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/signup', { method: 'POST', body: { name: e.target.name.value, email: e.target.email.value, password: e.target.password.value } });
      state.user = r.user; toast('Welcome to TLDB'); location.hash = '#/';
    } catch (err) { toast(err.message, true); }
  };
};

// ---------- contribute ----------
VIEWS.contribute = async (el) => {
  if (!state.user) { el.innerHTML = `<div class="empty"><a href="#/login">Sign in</a> to contribute.</div>`; return; }
  if (state.user.role === 'student') {
    el.innerHTML = `<div class="panel"><h2>Become a contributor</h2>
      <p class="muted" style="max-width:60ch">TLDB only accepts records from approved contributors — that is how the
      catalog stays clean. Tell us briefly why you want in, and an admin will review it.</p>
      <form id="req" class="stack">
        <label class="f" for="note">Why do you want to contribute?</label>
        <textarea id="note" placeholder="e.g. I maintain lecture notes for my batch and want to record the sources we use."></textarea>
        <button class="btn primary" type="submit">Request contributor access</button>
      </form></div>`;
    $('#req').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('/auth/request-contributor', { method: 'POST', body: { note: e.target.note.value } }); toast(r.status); e.target.reset(); }
      catch (err) { toast(err.message, true); }
    };
    return;
  }
  const mine = await api('/contributions/mine');
  el.innerHTML = `
    <div class="panel"><h2>Add a lecture to the record</h2>
      <p class="muted" style="font-size:13.5px">You are recording metadata and a pointer to the source — never the video itself.
      Only add material you have the right to link, and name the rights holder honestly.</p>
      <form id="cf" class="grid2">
        <div><label class="f" for="t">Title *</label><input class="plain" id="t" required></div>
        <div><label class="f" for="ed">Educator</label><input class="plain" id="ed" placeholder="e.g. Gilbert Strang"></div>
        <div><label class="f" for="co">Company / publisher</label><input class="plain" id="co" placeholder="e.g. MIT"></div>
        <div><label class="f" for="rh">Rights holder</label><input class="plain" id="rh" placeholder="who owns the video"></div>
        <div><label class="f" for="st">Source type *</label>
          <select class="plain" id="st">${['youtube', 'archive', 'torrent', 'file', 'stream', 'other'].map(s => `<option>${s}</option>`).join('')}</select></div>
        <div><label class="f" for="su">Source URL *</label><input class="plain" id="su" type="url" required placeholder="https://…"></div>
        <div><label class="f" for="sj">Subject</label><input class="plain" id="sj" placeholder="e.g. Computer Science"></div>
        <div><label class="f" for="yr">Year</label><input class="plain" id="yr" type="number" min="1950" max="2100"></div>
        <div><label class="f" for="du">Duration (minutes)</label><input class="plain" id="du" type="number" min="0"></div>
        <div><label class="f" for="tg">Tags (comma separated)</label><input class="plain" id="tg" placeholder="algorithms, cs"></div>
        <div><label class="f" for="cn">Course / playlist (optional — groups same-topic lectures)</label><input class="plain" id="cn" placeholder="e.g. MIT 6.006 — full course"></div>
        <div><label class="f" for="bn">Batch name (optional — original batch/cohort)</label><input class="plain" id="bn" placeholder="e.g. Lakshya JEE 2024, CS50 2024"></div>
        <div style="grid-column:1/-1"><label class="f" for="ds">Description</label><textarea id="ds"></textarea></div>
        <div style="grid-column:1/-1"><button class="btn primary" type="submit">Submit for review</button></div>
      </form></div>
    <div class="panel"><h2>Your submissions</h2>
      ${mine.contributions.length ? `<table class="grid"><tr><th>When</th><th>Title</th><th>Status</th><th>Record</th></tr>
        ${mine.contributions.map(c => {
          let p = {}; try { p = JSON.parse(c.payload || '{}'); } catch {}
          return `<tr><td class="mono">${esc(c.created_at)}</td><td>${esc(p.title || c.action)}</td>
            <td><span class="badge ${c.status === 'approved' ? 'sage' : c.status === 'rejected' ? 'red' : 'gold'}">${c.status}</span>${c.review_note ? `<div class="muted" style="font-size:12px">${esc(c.review_note)}</div>` : ''}</td>
            <td>${c.public_id ? `<a class="mono" href="#/lecture/${esc(c.lecture_slug)}">${esc(c.public_id)}</a>` : '—'}</td></tr>`;
        }).join('')}</table>` : '<div class="empty">Nothing submitted yet.</div>'}
    </div>`;
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => e.target.querySelector('#' + id).value.trim();
    try {
      await api('/contributions', { method: 'POST', body: {
        title: v('t'), educator_name: v('ed'), company_name: v('co'), rights_holder: v('rh'),
        course_name: v('cn'), batch_name: v('bn'),
        source_type: v('st'), source_url: v('su'), subject: v('sj'), year: v('yr'),
        duration_sec: (Number(v('du')) || 0) * 60,
        tags: v('tg') ? v('tg').split(',').map(s => s.trim()).filter(Boolean) : [],
        description: v('ds'),
      }});
      toast('Submitted — an admin will review it'); VIEWS.contribute(el);
    } catch (err) { toast(err.message, true); }
  };
};

// ---------- API keys ----------
VIEWS.account = async (el) => {
  if (!state.user) { el.innerHTML = `<div class="empty"><a href="#/login">Sign in</a> to manage your account.</div>`; return; }
  el.innerHTML = `
    <div class="panel"><h2>Account</h2>
      <div class="kv" style="max-width:420px">
        <dt>signed in as</dt><dd>${esc(state.user.name)} <span class="mono muted">${esc(state.user.email)}</span></dd>
        <dt>role</dt><dd><span class="badge sage">${esc(state.user.role)}</span></dd>
      </div>
      <h3 style="margin-top:20px">Change password</h3>
      <form id="cpf" class="stack" style="max-width:360px">
        <div><label class="f" for="cp0">Current password</label><input class="plain" type="password" id="cp0" required autocomplete="current-password"></div>
        <div><label class="f" for="cp1">New password (min 8 characters)</label><input class="plain" type="password" id="cp1" required minlength="8" autocomplete="new-password"></div>
        <button class="btn primary" type="submit">Change password</button>
      </form>
    </div>`;
  $('#cpf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { current: e.target.cp0.value, next: e.target.cp1.value } });
      toast(r.message || 'Password changed'); e.target.reset();
    } catch (err) { toast(err.message, true); }
  };
};

VIEWS.keys = async (el) => {
  if (!state.user) { el.innerHTML = `<div class="empty"><a href="#/login">Sign in</a> to manage API keys.</div>`; return; }
  const data = await api('/keys');
  el.innerHTML = `
    <div class="panel"><h2>API keys</h2>
      <p class="muted" style="font-size:13.5px">The public read API lives at <code class="mono">/v1/lectures</code>.
      Send your key as <code class="mono">X-API-Key</code>. Limit: 120 requests/min per key.</p>
      <div class="notice">Example: <span class="mono">curl -H "X-API-Key: tldb_…" ${location.origin}/v1/lectures?query=algorithms</span></div>
      <form id="kf" class="stack" style="display:flex;gap:10px;align-items:end">
        <div style="flex:1"><label class="f" for="kn">Key name</label><input class="plain" id="kn" placeholder="e.g. lectrio-dev" required style="margin-top:6px"></div>
        <button class="btn primary" type="submit">Create key</button>
      </form>
      <div id="newkey"></div>
      ${data.keys.length ? `<table class="grid" style="margin-top:16px"><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Status</th><th>Last used</th><th></th></tr>
        ${data.keys.map(k => `<tr><td>${esc(k.name)}</td><td class="mono">${esc(k.prefix)}…</td><td class="mono">${esc(k.scopes)}</td>
          <td><span class="badge ${k.status === 'active' ? 'sage' : 'red'}">${k.status}</span></td>
          <td class="mono muted">${esc(k.last_used_at || 'never')}</td>
          <td>${k.status === 'active' ? `<button class="btn small danger" data-revoke="${k.id}">Revoke</button>` : ''}</td></tr>`).join('')}</table>`
        : '<div class="empty">No keys yet.</div>'}
    </div>`;
  $('#kf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/keys', { method: 'POST', body: { name: e.target.kn.value } });
      $('#newkey').innerHTML = `<div class="notice">New key — copy it now, it will not be shown again:<div class="keyreveal">${esc(r.key)}</div></div>`;
      e.target.reset();
    } catch (err) { toast(err.message, true); }
  };
  el.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    await api('/keys/' + b.dataset.revoke, { method: 'DELETE' }); toast('Key revoked'); VIEWS.keys(el);
  });
};

// ---------- admin ----------
VIEWS.admin = async (el) => {
  if (!state.user || !['admin', 'moderator'].includes(state.user.role)) {
    el.innerHTML = '<div class="empty">Admin access only.</div>'; return;
  }
  const [ov, queue, catalog, fb, courses] = await Promise.all([
    api('/admin/overview'), api('/admin/queue'), api('/admin/lectures'), api('/admin/feedback'), api('/admin/courses')]);
  el.innerHTML = `
    <div class="hero-stats" style="margin:0 0 26px">
      <div class="stat"><b>${ov.pending}</b><span>submissions waiting</span></div>
      <div class="stat"><b>${ov.role_requests}</b><span>contributor requests</span></div>
      <div class="stat"><b>${ov.published}</b><span>on record</span></div>
      <div class="stat"><b>${ov.users}</b><span>users (${ov.contributors} contributors)</span></div>
      <div class="stat"><b>${ov.keys}</b><span>active API keys</span></div>
      <div class="stat"><b>${ov.feedback_open}</b><span>open feedback</span></div>
    </div>
    <div class="panel"><h2>Courses & playlists</h2>
      <form id="courseForm" class="grid2">
        <div><label class="f" for="ct">Course title *</label><input class="plain" id="ct" required placeholder="e.g. MIT 6.006 — Introduction to Algorithms"></div>
        <div><label class="f" for="ce">Educator</label><input class="plain" id="ce" placeholder="must match an educator name"></div>
        <div><label class="f" for="cc">Company</label><input class="plain" id="cc"></div>
        <div><label class="f" for="cs">Subject</label><input class="plain" id="cs"></div>
        <div><label class="f" for="cy">Year</label><input class="plain" id="cy" type="number"></div>
        <div><label class="f" for="cd">Description</label><input class="plain" id="cd"></div>
        <div style="grid-column:1/-1"><button class="btn small primary" type="submit">Create course</button></div>
      </form>
      <div class="notice" style="margin-top:14px">Assign a lecture: pick the course, enter its <span class="mono">LC-xxxxxx</span> id or slug and the position it should sit at.</div>
      <form id="assignForm" class="stack" style="display:flex;gap:10px;align-items:end">
        <div style="flex:2"><label class="f" for="ac">Course</label><select class="plain" id="ac" style="margin-top:6px">${courses.courses.map(x => `<option value="${x.id}">${esc(x.title)} (${x.lecture_count})</option>`).join('')}</select></div>
        <div style="flex:2"><label class="f" for="al">Lecture (LC-id or slug)</label><input class="plain" id="al" placeholder="LC-000001" style="margin-top:6px"></div>
        <div style="flex:1"><label class="f" for="apos">Position</label><input class="plain" id="apos" type="number" min="1" style="margin-top:6px"></div>
        <button class="btn small" type="submit" id="assignBtn">Add to course</button>
        <button class="btn small danger" type="button" id="removeBtn">Remove from course</button>
      </form>
    </div>
    <div class="panel"><h2>Feedback desk</h2>
      ${fb.feedback.length ? fb.feedback.map(f => `
        <div class="queue-item" data-fid="${f.id}">
          <h3>${f.type === 'edit' ? 'Edit suggestion' : f.type === 'report' ? 'Issue report' : 'Feedback'} — <span class="badge ${f.status === 'open' ? 'gold' : f.status === 'resolved' ? 'sage' : ''}">${f.status}</span></h3>
          <div class="qmeta">by ${esc(f.sender_name || 'anonymous')} (${esc(f.sender_email || '—')}) · ${esc(f.created_at)}
            ${f.lecture_title ? ` · on <a href="#/lecture/${esc(f.lecture_slug)}">${esc(f.lecture_title)}</a>` : ''}
            ${f.educator_name ? ` · educator: ${esc(f.educator_name)}` : ''}${f.company_name ? ` · company: ${esc(f.company_name)}` : ''}</div>
          <div style="font-size:14px;max-width:70ch">${esc(f.message)}</div>
          ${f.resolution_note ? `<div class="muted" style="font-size:12.5px;margin-top:6px">Note: ${esc(f.resolution_note)}</div>` : ''}
          ${f.status === 'open' ? `<div class="qactions">
            <button class="btn small primary" data-fb="resolved">Mark resolved</button>
            <button class="btn small danger" data-fb="dismissed">Dismiss</button>
          </div>` : ''}
        </div>`).join('') : '<div class="empty">No feedback yet.</div>'}
    </div>
    <div class="panel"><h2>Review queue</h2>
      ${queue.queue.length ? queue.queue.map(item => {
        const p = item.payload;
        return `<div class="queue-item" data-cid="${item.id}">
          <h3>${esc(p.title || item.action)}</h3>
          <div class="qmeta">by ${esc(item.submitter_name)} (${esc(item.submitter_email)}) · ${esc(item.created_at)} ·
            ${p.source_type ? `<span class="badge">${esc(p.source_type)}</span> ` : ''}${p.educator_name ? 'educator: ' + esc(p.educator_name) + ' · ' : ''}${p.rights_holder ? 'rights: ' + esc(p.rights_holder) : ''}</div>
          ${p.description ? `<div style="font-size:13.5px;max-width:70ch">${esc(p.description)}</div>` : ''}
          ${p.source_url ? `<div class="mono muted" style="margin-top:6px">${esc(p.source_url)}</div>` : ''}
          ${item.action === 'request_contributor' ? `<div class="muted" style="font-size:13px">Contributor request: “${esc(p.note || '—')}”</div>` : ''}
          <div class="qactions">
            <button class="btn small primary" data-act="approve">Approve & publish</button>
            <button class="btn small danger" data-act="reject">Reject</button>
          </div></div>`;
      }).join('') : '<div class="empty">Queue is clear.</div>'}
    </div>
    <div class="panel"><h2>Catalog — featured picks</h2>
      <p class="muted" style="font-size:13px">Featured records appear in the home page hero. Toggle below.</p>
      <table class="grid"><tr><th>ID</th><th>Title</th><th>Likes</th><th>Views</th><th>Source</th><th>Featured</th></tr>
        ${catalog.lectures.map(l => `<tr><td class="mono">${esc(l.public_id)}</td>
          <td><a href="#/lecture/${esc(l.slug)}">${esc(l.title)}</a></td>
          <td class="mono">${l.likes}</td><td class="mono">${l.views}</td>
          <td>${l.source_status === 'dead' ? `<button class="btn small" data-src="${l.id}">Mark alive</button>` : `<button class="btn small danger" data-src="${l.id}">Mark dead</button>`}</td>
          <td><button class="btn small ${l.featured ? 'primary' : ''}" data-feat="${l.id}">${l.featured ? '★ Featured' : 'Feature'}</button></td></tr>`).join('')}</table>
    </div>
    <div class="panel"><h2>Users</h2><div id="usersBox"><div class="empty">Loading…</div></div></div>`;
  el.querySelectorAll('.queue-item[data-fid]').forEach(item => {
    item.querySelectorAll('[data-fb]').forEach(b => b.onclick = async () => {
      const note = b.dataset.fb === 'dismissed' ? (prompt('Note (optional):') || '') : (prompt('Resolution note (optional):') || '');
      await api(`/admin/feedback/${item.dataset.fid}`, { method: 'POST', body: { status: b.dataset.fb, note } });
      toast('Feedback ' + b.dataset.fb); VIEWS.admin(el);
    });
  });
  el.querySelectorAll('.queue-item[data-cid]').forEach(item => {
    const cid = item.dataset.cid;
    item.querySelector('[data-act="approve"]').onclick = async () => {
      try { const r = await api(`/admin/contributions/${cid}/approve`, { method: 'POST', body: {} }); toast('Approved — ' + (r.public_id || r.result || 'done')); VIEWS.admin(el); }
      catch (e) { toast(e.message, true); }
    };
    item.querySelector('[data-act="reject"]').onclick = async () => {
      const note = prompt('Reason for rejection (shown to the contributor):') || '';
      await api(`/admin/contributions/${cid}/reject`, { method: 'POST', body: { note } });
      toast('Rejected'); VIEWS.admin(el);
    };
  });
  const users = await api('/admin/users');
  $('#usersBox').innerHTML = `<table class="grid"><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
    ${users.users.map(u => `<tr><td>${esc(u.name)}</td><td class="mono muted">${esc(u.email)}</td>
      <td><select class="plain" data-role="${u.id}" style="padding:4px 8px;width:auto" ${state.user.role !== 'admin' ? 'disabled' : ''}>
        ${['student', 'contributor', 'moderator', 'admin'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td><span class="badge ${u.status === 'active' ? 'sage' : 'red'}">${u.status}</span></td>
      <td>${state.user.role === 'admin' && u.id !== state.user.id ? `<button class="btn small danger" data-ban="${u.id}" data-to="${u.status === 'active' ? 'banned' : 'active'}">${u.status === 'active' ? 'Ban' : 'Unban'}</button>` : ''}</td></tr>`).join('')}</table>`;
  el.querySelectorAll('[data-src]').forEach(b => b.onclick = async () => {
    await api(`/admin/lectures/${b.dataset.src}/source-status`, { method: 'POST', body: { status: b.textContent.includes('dead') ? 'ok' : 'dead' } });
    toast('Source status updated'); VIEWS.admin(el);
  });
  el.querySelectorAll('[data-feat]').forEach(b => b.onclick = async () => {
    await api(`/admin/lectures/${b.dataset.feat}/feature`, { method: 'POST', body: {} }); VIEWS.admin(el);
  });
  $('#courseForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => e.target.querySelector('#' + id).value.trim();
    try {
      const r = await api('/admin/courses', { method: 'POST', body: { title: v('ct'), educator_name: v('ce'), company_name: v('cc'), subject: v('cs'), year: v('cy'), description: v('cd') } });
      toast('Course created: ' + r.slug); VIEWS.admin(el);
    } catch (err) { toast(err.message, true); }
  };
  $('#assignForm').onsubmit = async (e) => {
    e.preventDefault();
    const g = (id) => e.target.querySelector('#' + id).value.trim();
    try {
      const r = await api(`/admin/courses/${g('ac')}/lectures`, { method: 'POST', body: { lecture: g('al'), position: g('apos') } });
      toast('Assigned at position ' + r.position); VIEWS.admin(el);
    } catch (err) { toast(err.message, true); }
  };
  $('#removeBtn').onclick = async () => {
    const lecture = $('#al').value.trim();
    if (!lecture) return toast('Enter the lecture id first', true);
    try {
      await api(`/admin/courses/${$('#ac').value}/remove-lecture`, { method: 'POST', body: { lecture } });
      toast('Removed from course'); VIEWS.admin(el);
    } catch (err) { toast(err.message, true); }
  };
  el.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
    await api(`/admin/users/${s.dataset.role}/role`, { method: 'POST', body: { role: s.value } }); toast('Role updated');
  });
  el.querySelectorAll('[data-ban]').forEach(b => b.onclick = async () => {
    await api(`/admin/users/${b.dataset.ban}/status`, { method: 'POST', body: { status: b.dataset.to } }); toast('Status updated'); VIEWS.admin(el);
  });
};
