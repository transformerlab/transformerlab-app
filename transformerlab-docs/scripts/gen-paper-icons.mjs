// Generates one on-brand SVG thumbnail per paper into static/papers/icons/<slug>.svg
// Style: seeded indigo→violet gradient wash + a generative geometric MOTIF chosen by
// the paper's primary topic tag. No text (tags already render on the card). Deterministic
// (seeded by slug) so re-running is stable. SVGs are plain text and hand-editable —
// tweak any generated file by hand, or drop in a real image and point the paper's
// `image` field at it in src/data/papers.json instead.
//
// Run: npm run gen:paper-icons  (or: node scripts/gen-paper-icons.mjs)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(REPO, 'src/data/papers.json');
const OUT = resolve(REPO, 'static/papers/icons');

const W = 360;
const H = 270;

// Deterministic 32-bit hash (FNV-1a).
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Seeded PRNG (LCG) for stable per-slug values.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const W_ = (op) => `#ffffff" opacity="${op}`; // white with opacity helper for fills/strokes

// ---- Motifs. Each returns an SVG fragment drawn in white over the gradient. ----

// LLM: a stream of "tokens" — staggered rounded bars, like masked text lines.
function motifTokens(r) {
  const rows = 5;
  let out = '';
  for (let i = 0; i < rows; i++) {
    const y = 58 + i * 32;
    let x = 40;
    const accent = i === 1 + Math.floor(r() * 2);
    while (x < W - 50) {
      const w = 26 + Math.floor(r() * 70);
      const op = accent ? 0.6 : 0.16 + r() * 0.1;
      out += `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="#ffffff" opacity="${op.toFixed(3)}" />\n  `;
      x += w + 14;
    }
  }
  return out;
}

// INTERPRETABILITY: concentric arcs — a lens looking "inside" the model.
function motifArcs(r) {
  const cx = 235 + Math.floor(r() * 40);
  const cy = 110 + Math.floor(r() * 50);
  let out = '';
  for (let i = 6; i >= 1; i--) {
    const rad = i * 24;
    const op = 0.1 + (6 - i) * 0.05;
    out += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#ffffff" stroke-width="5" opacity="${op.toFixed(3)}" />\n  `;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="9" fill="#ffffff" opacity="0.9" />\n  `;
  return out;
}

// RL: a feedback loop — an open ring with an arrowhead, plus reward dots.
function motifLoop(r) {
  const cx = 180,
    cy = 135,
    rad = 78;
  // open ring via a stroked circle with a dash gap
  let out = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.5" stroke-dasharray="370 120" stroke-linecap="round" transform="rotate(${Math.floor(r() * 360)} ${cx} ${cy})" />\n  `;
  // arrowhead near top
  out += `<path d="M ${cx + rad} ${cy - 16} l 20 16 l -20 16 z" fill="#ffffff" opacity="0.85" transform="rotate(${20 + Math.floor(r() * 30)} ${cx} ${cy})" />\n  `;
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const rr = rad + 26 + r() * 18;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 + r() * 5).toFixed(1)}" fill="#ffffff" opacity="${(0.4 + r() * 0.4).toFixed(2)}" />\n  `;
  }
  return out;
}

// SYSTEMS: a chip grid — array of squares, some lit.
function motifGrid(r) {
  const cols = 6,
    rows = 4,
    cell = 40,
    gap = 8;
  const gw = cols * cell + (cols - 1) * gap;
  const gh = rows * cell + (rows - 1) * gap;
  const x0 = (W - gw) / 2;
  const y0 = (H - gh) / 2;
  let out = '';
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = x0 + cx * (cell + gap);
      const y = y0 + cy * (cell + gap);
      const lit = r() > 0.62;
      const op = lit ? 0.55 : 0.14;
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell}" height="${cell}" rx="7" fill="#ffffff" opacity="${op.toFixed(2)}" />\n  `;
    }
  }
  return out;
}

// VISION: an aperture/iris — rotating blades around a center.
function motifAperture(r) {
  const cx = 180,
    cy = 135,
    rad = 92;
  const blades = 6;
  const start = r() * 60;
  let out = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.4" />\n  `;
  for (let i = 0; i < blades; i++) {
    const a = ((start + (i * 360) / blades) * Math.PI) / 180;
    const x1 = cx + Math.cos(a) * rad;
    const y1 = cy + Math.sin(a) * rad;
    const a2 = a + 1.05;
    const x2 = cx + Math.cos(a2) * rad;
    const y2 = cy + Math.sin(a2) * rad;
    out += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rad} ${rad} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="#ffffff" opacity="${(0.1 + (i % 2) * 0.12).toFixed(2)}" />\n  `;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="22" fill="#ffffff" opacity="0.85" />\n  `;
  return out;
}

// 3D: an isometric wireframe cube.
function motifCube(r) {
  const cx = 180,
    cy = 138;
  const s = 64; // half-size
  // isometric projection offsets
  const ux = s,
    uy = s * 0.5; // right axis
  const vx = -s,
    vy = s * 0.5; // left axis
  const wy = -s; // up axis
  const P = (a, b, c) => [cx + a * ux + b * vx, cy + a * uy + b * vy + c * wy];
  const top = P(0, 0, 1);
  const f = [P(1, 0, 0), P(0, 0, 0), P(0, 1, 0)]; // bottom-ish corners
  const e = [P(1, 0, 1), P(0, 1, 1)];
  const line = (a, b, op) =>
    `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="${op}" />\n  `;
  let out = '';
  // verticals
  out += line(f[0], P(1, 0, 1), 0.5);
  out += line(f[1], top, 0.5);
  out += line(f[2], P(0, 1, 1), 0.5);
  // top face
  out += line(top, e[0], 0.7);
  out += line(top, e[1], 0.7);
  out += line(e[0], P(1, 1, 1), 0.7);
  out += line(e[1], P(1, 1, 1), 0.7);
  // bottom edges (front)
  out += line(f[1], f[0], 0.4);
  out += line(f[1], f[2], 0.4);
  void r;
  return out;
}

// RAG: a small retrieval graph — nodes connected by edges.
function motifGraph(r) {
  const nodes = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    nodes.push([60 + r() * (W - 120), 50 + r() * (H - 100)]);
  }
  let out = '';
  // edges: connect each node to the nearest 1-2 others
  for (let i = 0; i < n; i++) {
    const j = (i + 1 + Math.floor(r() * (n - 1))) % n;
    out += `<line x1="${nodes[i][0].toFixed(1)}" y1="${nodes[i][1].toFixed(1)}" x2="${nodes[j][0].toFixed(1)}" y2="${nodes[j][1].toFixed(1)}" stroke="#ffffff" stroke-width="3" opacity="0.3" />\n  `;
  }
  for (let i = 0; i < n; i++) {
    const rr = 8 + r() * 10;
    out += `<circle cx="${nodes[i][0].toFixed(1)}" cy="${nodes[i][1].toFixed(1)}" r="${rr.toFixed(1)}" fill="#ffffff" opacity="${(0.45 + r() * 0.4).toFixed(2)}" />\n  `;
  }
  return out;
}

// AUDIO: a waveform — vertical bars symmetric about the midline.
function motifWave(r) {
  const mid = H / 2;
  const bars = 22;
  const gap = (W - 56) / bars;
  let out = '';
  for (let i = 0; i < bars; i++) {
    const x = 28 + i * gap + gap * 0.2;
    const h = 14 + r() * 96;
    const op = 0.3 + r() * 0.4;
    out += `<rect x="${x.toFixed(1)}" y="${(mid - h / 2).toFixed(1)}" width="${(gap * 0.6).toFixed(1)}" height="${h.toFixed(1)}" rx="${(gap * 0.3).toFixed(1)}" fill="#ffffff" opacity="${op.toFixed(2)}" />\n  `;
  }
  return out;
}

// Particle/dot field — default fallback motif.
function motifDots(r) {
  let out = '';
  for (let i = 0; i < 26; i++) {
    const x = 30 + r() * (W - 60);
    const y = 30 + r() * (H - 60);
    const rr = 3 + r() * 12;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#ffffff" opacity="${(0.12 + r() * 0.4).toFixed(2)}" />\n  `;
  }
  return out;
}

// Map a primary topic tag → motif. First matching tag (in priority order) wins so a
// paper tagged e.g. ["LLM","INTERPRETABILITY"] reads as interpretability.
const MOTIFS = {
  INTERPRETABILITY: motifArcs,
  RL: motifLoop,
  SYSTEMS: motifGrid,
  VISION: motifAperture,
  '3D': motifCube,
  RAG: motifGraph,
  AUDIO: motifWave,
  LLM: motifTokens,
};
const PRIORITY = [
  'INTERPRETABILITY',
  '3D',
  'AUDIO',
  'RAG',
  'VISION',
  'SYSTEMS',
  'RL',
  'LLM',
];

function pickMotif(tags = []) {
  for (const key of PRIORITY) {
    if (tags.includes(key)) return MOTIFS[key];
  }
  return motifDots;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgFor(paper) {
  const rand = rng(hash(paper.slug));

  // Brand family: blue → indigo → violet → purple (hue 210–285).
  const hue1 = 210 + Math.floor(rand() * 75);
  const hue2 = hue1 + 25 + Math.floor(rand() * 25);
  const c1 = `hsl(${hue1} 72% 56%)`;
  const c2 = `hsl(${hue2} 68% 46%)`;
  const angle = Math.floor(rand() * 360);

  const motif = pickMotif(paper.tags)(rand);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(paper.tags?.join(', ') || paper.title)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${c1}" />
      <stop offset="1" stop-color="${c2}" />
    </linearGradient>
    <radialGradient id="v" cx="0.3" cy="0.25" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
      <stop offset="1" stop-color="#000000" stop-opacity="0.14" />
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)" />
  ${motif}<rect width="${W}" height="${H}" fill="url(#v)" />
</svg>
`;
}

const papers = JSON.parse(readFileSync(DATA, 'utf8'));
let written = 0;
for (const p of papers) {
  writeFileSync(resolve(OUT, `${p.slug}.svg`), svgFor(p));
  written++;
}
console.log(`Wrote ${written} SVGs to ${OUT}`);
