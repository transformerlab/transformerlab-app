/*
 * data.ts — the pure, deterministic core of the homepage scroll scene.
 *
 * Everything here is a plain function of constants (and a seeded RNG), with NO
 * DOM access. It is the React-friendly half of the old autoresearch-fleet.js:
 * the scene is a pure function of scroll progress p ∈ [0,1], so all of its
 * keyframes, generated chart data, paper-trail geometry and job schedule live
 * here and are consumed by <Scene/> via Framer Motion MotionValues.
 */

// ---- math ----
export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const smooth = (t: number): number => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
/** linear local progress of p within [a,b], clamped 0..1 */
export const loc = (p: number, a: number, b: number): number =>
  clamp((p - a) / (b - a || 1e-6), 0, 1);
/** smoothstepped local progress of p within [a,b] */
export const ease = (p: number, a: number, b: number): number =>
  smooth(loc(p, a, b));

/** tiny deterministic RNG (mulberry32) — same sequence every run */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- scene constants (ported from the old DEFAULTS) ----
export const SEED = 7;
export const HEADER_OFFSET = 66; // clears the site's sticky header
export const SESSIONS = 5;
export const CLOUDS = 12;
export const PILE_COUNT = 70; // papers in the streaming trail
export const FG_SCROLL_END = 0.99; // progress at which the foreground stops scrolling

export const TINTS = ['#0f9a55', '#2f8f74', '#3b6f8c', '#7d8a36', '#a06a2c'];
export const CLOUD_SIZES = [24, 20, 28, 18, 24, 22, 26, 18, 24, 20, 28, 22];
export const TRIALS = [46, 40, 52, 44, 48];

export const GREEN = '#0f9a55';
export const GREEN_D = '#0a7a3f';
export const LINE2 = '#c6c6bc';
export const FAINT = '#9a9a90';
export const DOT_COLOR = '#d2d3c9';
export const DOT_STROKE = '#bdbeb3';

export const HERO_TOP = 0.4; // hero vertical center as fraction of stage
export const JOB_DUR = 0.05;
export const DONE_WIN = 0.02;
export const PKT_WIN = 0.03;
export const Y_MIN = 0.04;
export const Y_MAX = 0.54;

/** keyframe bands, in progress units (see the old timeline comment) */
export const T = {
  fill: [0, 0.038],
  dock: [0.038, 0.07],
  fade: [0.059, 0.07],
  ses: [0.048, 0.081],
  cloud: [0.07, 0.102],
  flow: [0.097, 0.215],
  shrink: [0.215, 0.269],
  paper: [0.247, 0.29],
  report: [0.269, 0.344],
  fan: [0.333, 0.387],
  text: [0.333, FG_SCROLL_END],
  loop: [0.9, FG_SCROLL_END],
} as const;

// ---- best-so-far descent data (the little line charts) ----
export interface DescentData {
  K: number;
  trials: number[];
  mins: number[];
}
export function buildDescent(K: number, seed: number): DescentData {
  const rnd = rng(seed);
  const start = 0.42,
    end = 0.075,
    worst = 0.52;
  const trials: number[] = [];
  const mins: number[] = [];
  let m = Infinity;
  for (let i = 0; i < K; i++) {
    const f = i / (K - 1);
    const env = end + (start - end) * Math.exp(-3 * f);
    let y: number;
    if (rnd() < 0.3) y = env + Math.pow(rnd(), 0.8) * (worst - env);
    else y = env + Math.pow(rnd(), 1.7) * 0.045;
    trials.push(y);
    m = Math.min(m, y);
    mins.push(m);
  }
  return { K, trials, mins };
}

/** map a descent value to a y coordinate inside a padded viewBox */
export function descentX(
  i: number,
  K: number,
  W: number,
  padL: number,
  padR: number,
): number {
  return padL + (i / (K - 1)) * (W - padL - padR);
}
export function descentY(
  v: number,
  H: number,
  padT: number,
  padB: number,
): number {
  return padT + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * (H - padT - padB);
}

/** build the best-so-far step path for the first n points */
export function descentPath(
  d: DescentData,
  n: number,
  W: number,
  H: number,
  padL: number,
  padR: number,
  padT: number,
  padB: number,
): string {
  if (n <= 0) return '';
  const x = (i: number) => descentX(i, d.K, W, padL, padR);
  const y = (v: number) => descentY(v, H, padT, padB);
  let path = 'M ' + x(0) + ' ' + y(d.mins[0]);
  for (let j = 1; j < n; j++) path += ' H ' + x(j) + ' V ' + y(d.mins[j]);
  return path;
}

// ---- compute clouds: flat cell list + per-cloud sizes ----
export interface CellRef {
  cloud: number;
  local: number;
}
export function buildCells(): CellRef[] {
  const cells: CellRef[] = [];
  for (let c = 0; c < CLOUDS; c++) {
    const n = CLOUD_SIZES[c % CLOUD_SIZES.length];
    for (let local = 0; local < n; local++) cells.push({ cloud: c, local });
  }
  return cells;
}

// ---- the streaming paper trail geometry ----
export interface TrailNode {
  k: number; // 1-based index along the trail (0 is the head/front paper)
  x: number;
  y: number;
  rot: number;
}
export function buildTrail(pileN: number, seed: number): TrailNode[] {
  const STEP = 30, // px between consecutive papers along the trail
    A0 = (64 * Math.PI) / 180, // peak angle off vertical at the crest of the bend
    KBEND = 16; // papers over which the bend swells and then settles
  const R2 = rng(seed + 12);
  const nodes: TrailNode[] = [];
  let cx = 0,
    cy = 0;
  for (let pc = 1; pc < pileN; pc++) {
    const t = clamp((pc - 1) / KBEND, 0, 1);
    const ang = A0 * Math.sin(t * Math.PI);
    cx += STEP * Math.sin(ang);
    cy += STEP * Math.cos(ang);
    const ramp = clamp((pc - 1) / 3, 0, 1); // ease the shuffle in over the first few
    const wob = (R2() - 0.5) * 7 * ramp;
    nodes.push({
      k: pc,
      x: cx,
      y: cy,
      rot: ((ang * 180) / Math.PI) * 0.42 + wob,
    });
  }
  return nodes;
}
export const TRAIL_STEP = 30;

// ---- deterministic job schedule (cloud cell → session) ----
export interface Job {
  i: number; // session index
  cell: number; // flat cell index
  c: number; // complete progress
  d: number; // dispatch progress
}
export function buildJobs(cellCount: number): Job[] {
  const rnd = rng(SEED + 1);
  const list: number[] = [];
  for (let i = 1; i < SESSIONS; i++) {
    const K = TRIALS[i % TRIALS.length];
    for (let k = 0; k < K; k++) list.push(i);
  }
  // deterministic shuffle so sessions interleave
  for (let a = list.length - 1; a > 0; a--) {
    const b = (rnd() * (a + 1)) | 0;
    const tmp = list[a];
    list[a] = list[b];
    list[b] = tmp;
  }
  const M = list.length,
    F0 = T.flow[0],
    F1 = T.flow[1];
  const freeAt = new Array(cellCount).fill(-1);
  const jobs: Job[] = [];
  for (let j = 0; j < M; j++) {
    const c = F0 + (F1 - F0) * (j / Math.max(1, M - 1));
    const d = c - JOB_DUR;
    let pick = -1,
      soonest = Infinity;
    const startCell = (rnd() * cellCount) | 0;
    for (let s = 0; s < cellCount; s++) {
      const ci = (startCell + s) % cellCount;
      if (freeAt[ci] <= d) {
        pick = ci;
        break;
      }
      if (freeAt[ci] < soonest) {
        soonest = freeAt[ci];
        pick = ci;
      }
    }
    freeAt[pick] = c + DONE_WIN;
    jobs.push({ i: list[j], cell: pick, c, d });
  }
  return jobs;
}

/** blend a tint halfway to paper-white (for "done" cells) */
export function fadeTint(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16),
    g = parseInt(c.substr(2, 2), 16),
    b = parseInt(c.substr(4, 2), 16),
    t = 0.5;
  return `rgb(${Math.round(lerp(r, 252, t))},${Math.round(
    lerp(g, 249, t),
  )},${Math.round(lerp(b, 249, t))})`;
}
