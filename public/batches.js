/* TLDB batch pages — the provider's own course → subject → topic → item structure.
   Each institute shows slightly different facts, so the header layout is chosen per provider
   ("type" renderers). Type 1 = Physics Wallah style: status, price, certificate, dates. */

// status/access/certificate → { label, cls }
const STATUS_LABEL = {
  running: { label: 'Running', cls: 'ok' },
  upcoming: { label: 'Starts soon', cls: 'warn' },
  ended: { label: 'Ended', cls: 'off' },
  unknown: { label: 'Status unknown', cls: 'off' },
};
const CERT_LABEL = {
  included: 'Yes — included in the batch',
  none: 'No certificate',
  fee: 'Fee based — pay extra for the certificate',
  exam: 'Exam based — certificate on passing',
  unknown: 'Not stated',
};
const KIND_ICON = { video: '▶', notes: '✎', pdf: '▤', test: '◈', dpp: '◈' };

function money(b) {
  if (b.access === 'free') return 'Free';
  if (!b.price) return 'Paid';
  const cur = b.currency === 'INR' ? '₹' : (b.currency ? b.currency + ' ' : '');
  return cur + b.price;
}

function batchFacts(b) {
  const st = STATUS_LABEL[b.status] || STATUS_LABEL.unknown;
  const rows = [
    ['Status', `<span class="badge ${st.cls}">${st.label}</span>`],
    ['Access', b.access === 'free'
      ? '<span class="badge ok">Free</span>'
      : `<span class="badge warn">Paid</span> <span class="mono">${esc(money(b))}</span>`],
    ['Certificate', esc(CERT_LABEL[b.certificate] || CERT_LABEL.unknown)],
  ];
  if (b.starts_on && b.ends_on) rows.push(['Dates', `${esc(b.starts_on)} → ${esc(b.ends_on)}`]);
  else if (b.starts_on) rows.push(['Starts', esc(b.starts_on)]);
  else if (b.ends_on) rows.push(['Ended', esc(b.ends_on)]);
  if (b.language) rows.push(['Language', esc(b.language)]);
  if (b.subtitle) rows.push(['Also called', esc(b.subtitle)]);
  return rows;
}

// type-1 header (PW & similar): facts table + buy call to action
function headerType1(b, counts) {
  return `
    <div class="section-head" style="margin-top:0">
      <h1>${esc(b.name)}</h1>
      ${b.company_slug ? `<a href="#/company/${esc(b.company_slug)}">${esc(b.company)} →</a>` : ''}
    </div>
    ${b.description ? `<p class="muted">${esc(b.description)}</p>` : ''}
    <dl class="facts">
      ${batchFacts(b).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}
      <dt>Inside</dt><dd class="muted">${counts.subjects} subject${counts.subjects === 1 ? '' : 's'}, ${counts.topics} topic${counts.topics === 1 ? '' : 's'}, ${counts.videos} lecture${counts.videos === 1 ? '' : 's'}${counts.notes ? ` and ${counts.notes} notes or PDFs` : ''}</dd>
      <dt>Provider ids</dt><dd class="mono muted">batch ${esc(b.external_id)}${b.provider ? ` (${esc(b.provider.toUpperCase())})` : ''}</dd>
    </dl>
    ${b.purchase_url
      ? `<div class="actions"><a class="btn primary" href="${esc(b.purchase_url)}" target="_blank" rel="noopener">${b.access === 'free' ? 'Open at source' : 'Buy / enrol at source'} ↗</a></div>`
      : ''}`;
}

const HEADERS = { pw: headerType1, vibrant: headerType1, default: headerType1 };

VIEWS.batch = async (el, params) => {
  const provider = params.slug;
  const ext = params.id;
  el.innerHTML = skeleton('rows');
  let data;
  try { data = await api(`/batch/${encodeURIComponent(provider)}/${encodeURIComponent(ext)}`); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  const { batch: b, tree, counts } = data;
  const header = (HEADERS[b.provider] || HEADERS.default)(b, counts);

  const subjectBlocks = tree.length ? tree.map((s, si) => `
    <details class="tree-subject" ${si === 0 ? 'open' : ''}>
      <summary>
        <b>${esc(s.name)}</b>
        <span class="mono muted">${s.topics.length} topic${s.topics.length === 1 ? '' : 's'}${s.external_id ? `, id ${esc(s.external_id)}` : ''}</span>
      </summary>
      ${s.topics.length ? s.topics.map((t) => `
        <details class="tree-topic" ${si === 0 && t === s.topics[0] ? 'open' : ''}>
          <summary>
            <span>${esc(t.name)}</span>
            <span class="mono muted">${t.items.length} item${t.items.length === 1 ? '' : 's'}${t.external_id ? `, id ${esc(t.external_id)}` : ''}</span>
          </summary>
          ${t.items.length ? `<ul class="tree-items">${t.items.map((it) => `
            <li>
              <span class="kind">${KIND_ICON[it.kind] || '·'}</span>
              ${it.lecture_id
                ? `<a href="#/lecture/${esc(it.lecture_id)}">${esc(it.title)}</a>`
                : `<span>${esc(it.title)}</span>`}
              <span class="mono muted">${esc(it.kind)}${it.duration_sec ? `, ${Math.round(it.duration_sec / 60)} min` : ''}${it.external_id ? `, ${esc(it.external_id)}` : ''}</span>
              ${it.url ? `<a class="mono" href="${esc(it.url)}" target="_blank" rel="noopener">source ↗</a>` : ''}
            </li>`).join('')}</ul>`
            : '<div class="muted" style="padding:6px 0 10px">No items listed here yet.</div>'}
        </details>`).join('')
        : '<div class="muted" style="padding:6px 0 10px">No topics listed yet.</div>'}
    </details>`).join('')
    : '<div class="empty">The structure for this batch has not been recorded yet.</div>';

  el.innerHTML = `
    <div class="panel">${header}</div>
    <div class="section-head"><h2>What is inside</h2><span class="muted">subjects → topics → lectures, notes, PDFs</span></div>
    ${subjectBlocks}
    <div class="notice" style="margin-top:18px">
      Every item here is a <b>pointer</b> — a name, an id and (where known) the official page.
      TLDB never hosts the video, the notes or the PDF; paid batches link to the institute's own paywall.
    </div>`;
};
