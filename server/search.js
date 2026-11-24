// Fuzzy, typo-tolerant search shared by the catalog and the type-ahead.
// Designed for small-to-medium catalogs: cheap SQL first, JS scoring as the fallback.
'use strict';

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s) {
  const t = norm(s).split(' ').filter((x) => x.length > 1);
  return t.length ? t : norm(s).split(' ').filter(Boolean);
}

// A few spellings people actually type, mapped onto catalog vocabulary.
const ALIASES = {
  physic: 'physics', physics: 'physics', phy: 'physics', phys: 'physics',
  chem: 'chemistry', chemestry: 'chemistry', chemistry: 'chemistry',
  maths: 'mathematics', math: 'mathematics', mathemetics: 'mathematics', mathematics: 'mathematics',
  bio: 'biology', biolgy: 'biology', biology: 'biology',
  jee: 'jee', neet: 'neet', iit: 'jee', aiims: 'neet',
  kinematcs: 'kinematics', kinematics: 'kinematics', kinamatics: 'kinematics',
  thermodynamcs: 'thermodynamics', organic: 'organic', inorganic: 'inorganic',
  mole: 'mole', moles: 'mole', calculas: 'calculus', calculus: 'calculus',
  quardatic: 'quadratic', quadratic: 'quadratic', optics: 'optics', optiks: 'optics',
  pw: 'physics wallah', walha: 'wallah', walla: 'wallah', vibrant: 'vibrant',
  batchh: 'batch', lacture: 'lecture', lectures: 'lecture', lecturs: 'lecture',
  notes: 'notes', dpps: 'dpp', test: 'test', tests: 'test',
};

export function expand(t) {
  return norm(t).split(' ').map((w) => ALIASES[w] || w);
}

function grams(s) {
  const n = norm(s);
  const set = new Set();
  const padded = `  ${n} `;
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

export function dice(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}

const words = (s) => norm(s).split(' ').filter(Boolean);

// How well one query token matches a haystack string. 0 = no match, 1 = perfect.
export function tokenScore(tok, hay) {
  const h = norm(hay);
  if (!h || !tok) return 0;
  const ws = words(h);
  if (ws.includes(tok)) return 1;
  if (h === tok) return 1;
  // prefix ("kine" → "kinematics"), still a confident match
  if (tok.length >= 3 && ws.some((w) => w.startsWith(tok))) return 0.9;
  if (tok.length >= 4 && h.includes(tok)) return 0.75;
  // typo tolerance: best trigram overlap against any single word or the whole line
  let best = 0;
  for (const w of ws) {
    if (Math.abs(w.length - tok.length) > 4) continue;
    best = Math.max(best, dice(tok, w));
  }
  if (best < 0.55) best = Math.max(best, dice(tok, h) * 0.8);
  return best >= 0.4 ? best * 0.85 : 0;
}

// Score a row against all tokens; every token must land somewhere for a strong hit.
export function scoreTokens(toks, fields) {
  if (!toks.length) return 0;
  let sum = 0, matched = 0, strong = 0;
  for (const tok of toks) {
    let best = 0, at = 0;
    fields.forEach((f, i) => {
      const s = tokenScore(tok, f);
      // earlier fields matter more (title, then subject/batch, then names)
      const weighted = s * (1 - Math.min(i, 5) * 0.06);
      if (weighted > best) { best = weighted; at = i; }
    });
    if (best > 0.35) { matched++; if (best >= 0.7) strong++; }
    sum += best;
  }
  if (!matched) return 0;
  const coverage = matched / toks.length;
  return (sum / toks.length) * (0.4 + 0.6 * coverage) * (strong === toks.length ? 1 : 0.9);
}

// Rank a list of rows. fieldsFn(row) → ordered strings, most important first.
export function rank(toks, rows, fieldsFn, { limit = 24, min = 0.32 } = {}) {
  const scored = [];
  for (const row of rows) {
    const s = scoreTokens(toks, fieldsFn(row));
    if (s >= min) scored.push([s, row]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([score, row]) => ({ ...row, _score: Math.round(score * 100) / 100 }));
}

// Best single-word correction for "did you mean" style hints.
export function closest(toks, vocabulary) {
  const vocab = [...new Set(vocabulary.map(norm).filter((w) => w.length > 2))];
  const out = [];
  for (const tok of toks) {
    if (vocab.includes(tok)) { out.push(tok); continue; }
    let best = null, bestScore = 0;
    for (const w of vocab) {
      if (Math.abs(w.length - tok.length) > 3) continue;
      const s = dice(tok, w);
      if (s > bestScore) { bestScore = s; best = w; }
    }
    out.push(bestScore >= 0.62 ? best : tok);
  }
  return out.join(' ');
}
