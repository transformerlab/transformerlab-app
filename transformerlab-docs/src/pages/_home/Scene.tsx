/*
 * Scene.tsx — the scroll-scrubbed "one run becomes a fleet, then a library of
 * papers" scene, rewritten declaratively on Framer Motion.
 *
 * A single useScroll() yields scrollYProgress (p ∈ [0,1]). EVERY visual is a
 * MotionValue derived from p via useTransform — React owns the DOM, Framer
 * updates transforms outside the render loop, and nothing is moved or mutated
 * imperatively. Geometry that depends on live layout (a packet flying from a
 * GPU cell to a session card, a flow line between two boxes, a paper flying to
 * a publication slot) is measured from refs *inside* the transform function, so
 * it stays correct as the fleet scales and the foreground scrolls.
 */
import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
} from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from 'framer-motion';
import { DescentChart, PaperSVG, ReportPaper } from './visuals';
import {
  T,
  SESSIONS,
  CLOUDS,
  CLOUD_SIZES,
  TRIALS,
  TINTS,
  GREEN,
  PILE_COUNT,
  SEED,
  HEADER_OFFSET,
  HERO_TOP,
  PKT_WIN,
  DONE_WIN,
  TRAIL_STEP,
  Y_MIN,
  Y_MAX,
  clamp,
  lerp,
  ease,
  buildDescent,
  buildCells,
  buildJobs,
  buildTrail,
  fadeTint,
  type Job,
} from './data';

// height of the tall section, in viewport units — the scrub length
const SCENE_VH = 1450;

// ---- helpers ----
interface Rel {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}
function relRect(el: Element, wrap: Element): Rel {
  const r = el.getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  return {
    left: r.left - w.left,
    top: r.top - w.top,
    width: r.width,
    height: r.height,
    cx: r.left - w.left + r.width / 2,
    cy: r.top - w.top + r.height / 2,
  };
}

/** viewport size, measured on the client (SSR-safe default) */
function useViewport(): { w: number; h: number } {
  const [vp, setVp] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

const CloudIcon = (
  <svg
    className="cloud-icon"
    width="15"
    height="13"
    viewBox="0 0 24 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M6 16h11a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.7-1.3A3.8 3.8 0 0 0 6 16z" />
  </svg>
);

// ---------------------------------------------------------------------------
// GPU cell — lights up while a job runs on it, fades when the job completes
// ---------------------------------------------------------------------------
interface CellEvent {
  d: number;
  c: number;
  tint: string;
}
function Gpu({
  p,
  events,
  cellRef,
}: {
  p: MotionValue<number>;
  events: CellEvent[];
  cellRef: (el: HTMLDivElement | null) => void;
}): React.ReactElement {
  const bg = useTransform(p, (v) => {
    for (const e of events) {
      if (v >= e.d && v < e.c) return e.tint; // running
      if (v >= e.c && v < e.c + DONE_WIN) return fadeTint(e.tint); // just done
    }
    return '';
  });
  const scale = useTransform(bg, (b) => (b ? 1.16 : 1));
  return (
    <motion.div
      ref={cellRef}
      className="gpu"
      style={{ background: bg, borderColor: bg, scale }}
    />
  );
}

// ---------------------------------------------------------------------------
// Packet — a finished experiment flying from its GPU cell into its session
// ---------------------------------------------------------------------------
function Packet({
  p,
  job,
  tint,
  cellRefs,
  sessionRefs,
  wrapRef,
}: {
  p: MotionValue<number>;
  job: Job;
  tint: string;
  cellRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  sessionRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement {
  const pos = useTransform(p, (v): [number, number, number] => {
    const t = (v - job.c) / PKT_WIN;
    if (t < 0 || t > 1) return [0, 0, 0];
    const wrap = wrapRef.current,
      cell = cellRefs.current[job.cell],
      ses = sessionRefs.current[job.i];
    if (!wrap || !cell || !ses) return [0, 0, 0];
    const c = relRect(cell, wrap),
      s = relRect(ses, wrap);
    const x0 = c.cx,
      y0 = c.cy,
      x1 = s.left + s.width - 12,
      y1 = s.cy;
    const e = 1 - t;
    const mx = (x0 + x1) / 2,
      my = Math.min(y0, y1) - 26;
    const x = e * e * x0 + 2 * e * t * mx + t * t * x1;
    const y = e * e * y0 + 2 * e * t * my + t * t * y1;
    const op = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
    return [x, y, op];
  });
  const x = useTransform(pos, (a) => a[0]);
  const y = useTransform(pos, (a) => a[1]);
  const opacity = useTransform(pos, (a) => a[2]);
  return <motion.circle r={3} fill={tint} style={{ x, y, opacity }} />;
}

// ---------------------------------------------------------------------------
// Flow line — distils a session's results down into the report
// ---------------------------------------------------------------------------
function Flow({
  p,
  i,
  tint,
  sessionRefs,
  reportRef,
  wrapRef,
}: {
  p: MotionValue<number>;
  i: number;
  tint: string;
  sessionRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  reportRef: React.RefObject<HTMLDivElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement {
  const d = useTransform(p, (v) => {
    const pa = ease(v, T.paper[0], T.paper[1]);
    const fan = ease(v, T.fan[0], T.fan[1]);
    if (pa <= 0.002 || fan > 0.9) return '';
    const wrap = wrapRef.current,
      ses = sessionRefs.current[i],
      rep = reportRef.current;
    if (!wrap || !ses || !rep) return '';
    const s = relRect(ses, wrap),
      r = relRect(rep, wrap);
    const sx = s.cx,
      sy = s.top + s.height,
      tx = r.cx + (i - (SESSIONS - 1) / 2) * 7,
      ty = r.top - 2;
    const c1y = sy + (ty - sy) * 0.45,
      c2y = sy + (ty - sy) * 0.78;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${c1y.toFixed(
      1,
    )} ${tx.toFixed(1)} ${c2y.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
  });
  const opacity = useTransform(p, (v) => {
    const pa = ease(v, T.paper[0], T.paper[1]);
    const fan = ease(v, T.fan[0], T.fan[1]);
    return pa * 0.8 * (1 - fan);
  });
  const dashOffset = useTransform(p, (v) => {
    const rp = clamp((v - T.report[0]) / (T.report[1] - T.report[0]), 0, 1);
    return -rp * 180;
  });
  return (
    <motion.path
      d={d}
      style={{ opacity }}
      fill="none"
      stroke={tint}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeDasharray="5 8"
      strokeDashoffset={dashOffset}
    />
  );
}

// ---------------------------------------------------------------------------
// The hero descent chart: starts half-drawn, fills, then docks into slot 0
// ---------------------------------------------------------------------------
function SceneHero({
  p,
  heroRef,
  slot0Ref,
  wrapRef,
  vp,
}: {
  p: MotionValue<number>;
  heroRef: React.RefObject<HTMLDivElement | null>;
  slot0Ref: React.RefObject<HTMLDivElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  vp: { w: number; h: number };
}): React.ReactElement {
  const data = useMemo(() => buildDescent(TRIALS[0], 101), []);
  const count = useTransform(p, (v) =>
    Math.round(data.K * (0.5 + 0.5 * ease(v, T.fill[0], T.fill[1]))),
  );

  const stageH = vp.h - HEADER_OFFSET;

  // Measure slot 0's geometry at the fleet's FULL scale (and the wrap/hero
  // anchors) once, decoupled from the live shrink. Reading slot 0's live rect
  // each frame raced the fleet's own shrink transform, so the docked hero kept
  // a stale full-size position while the session cards shrank around it. We
  // invert whatever shrink is currently applied to recover the full-scale
  // values, then re-apply the shrink analytically in the dock transform.
  const geom = useRef<{
    cx0: number;
    cy0: number;
    w0: number;
    h0: number;
    fcx: number;
    fcy: number;
    hcy: number;
    heroW: number;
    heroH: number;
  } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current,
        slot = slot0Ref.current,
        hero = heroRef.current;
      if (!wrap || !slot || !hero) return;
      const wr = wrap.getBoundingClientRect();
      const fcx = wr.width / 2, // fleet-inner centre (its transform origin)
        fcy = wr.height / 2;
      const sr = relRect(slot, wrap); // possibly mid-shrink
      const sh = ease(p.get(), T.shrink[0], T.shrink[1]);
      const sNow = 1 - sh * 0.42;
      const byNow = -sh * 0.21 * stageH;
      geom.current = {
        w0: sr.width / sNow,
        h0: sr.height / sNow,
        cx0: fcx + (sr.cx - fcx) / sNow,
        cy0: fcy + (sr.cy - byNow - fcy) / sNow,
        fcx,
        fcy,
        hcy: wr.height * HERO_TOP,
        heroW: hero.offsetWidth || 540,
        heroH: hero.offsetHeight || 300,
      };
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [vp.w, vp.h, stageH, heroRef, slot0Ref, wrapRef, p]);

  // dock transform: place the hero onto slot 0 (full-scale), then move/scale it
  // exactly as the fleet's shrink (boxScale s about the fleet centre + boxY)
  // moves slot 0 — all analytically, so it tracks the shrinking fleet.
  const dock = useTransform(p, (v): [number, number, number, number] => {
    const g = geom.current;
    if (!g) return [0, 0, 1, 1];
    const dk = ease(v, T.dock[0], T.dock[1]);
    const sh = ease(v, T.shrink[0], T.shrink[1]);
    const s = 1 - sh * 0.42;
    const by = -sh * 0.21 * stageH;
    // slot 0's centre/size after the fleet shrink
    const sCx = g.fcx + s * (g.cx0 - g.fcx);
    const sCy = g.fcy + by + s * (g.cy0 - g.fcy);
    const scaleX = lerp(1, (g.w0 * s) / g.heroW, dk);
    const scaleY = lerp(1, (g.h0 * s) / g.heroH, dk);
    const tx = lerp(0, sCx - g.fcx, dk); // hero anchor x === fleet centre x
    const ty = lerp(0, sCy - g.hcy, dk);
    return [tx, ty, scaleX, scaleY];
  });
  const x = useTransform(dock, (a) => a[0]);
  const y = useTransform(dock, (a) => a[1]);
  const scaleX = useTransform(dock, (a) => a[2]);
  const scaleY = useTransform(dock, (a) => a[3]);
  const opacity = useTransform(p, (v) => 1 - ease(v, T.fan[0], T.fan[1]));
  const borderWidth = useTransform(
    scaleX,
    (sx) => (1 / Math.max(sx, 0.01)).toFixed(2) + 'px',
  );
  const lineW = useTransform(p, (v) =>
    lerp(2.8, 4.8, ease(v, T.dock[0], T.dock[1])),
  );
  void lineW; // chart stroke width is fixed in this port; dock scaling reads visually fine

  return (
    <motion.div
      ref={heroRef}
      className="scene-hero"
      style={{
        x,
        y,
        scaleX,
        scaleY,
        opacity,
        borderWidth: borderWidth as unknown as string,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      <DescentChart
        data={data}
        count={count}
        tint={GREEN}
        w={720}
        h={286}
        dotR={3.2}
        lineW={2.8}
        pad={8}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// A session card on the left (slots 1..4) — reveals, then fills as jobs land
// ---------------------------------------------------------------------------
function SessionCard({
  p,
  i,
  jobs,
  cardRef,
}: {
  p: MotionValue<number>;
  i: number;
  jobs: Job[];
  cardRef: (el: HTMLDivElement | null) => void;
}): React.ReactElement {
  const tint = TINTS[i % TINTS.length];
  const data = useMemo(
    () => buildDescent(TRIALS[i % TRIALS.length], 101 + i * 13),
    [i],
  );
  const myJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.i === i)
        .map((j) => j.c)
        .sort((a, b) => a - b),
    [jobs, i],
  );
  const revealAt = lerp(T.ses[0], T.ses[1], i / Math.max(1, SESSIONS - 1));
  const opacity = useTransform(p, (v) => (v > revealAt ? 1 : 0));
  const yMV = useTransform(p, (v) => (v > revealAt ? 0 : 14));
  const count = useTransform(p, (v) => {
    let n = 0;
    for (const c of myJobs) if (v >= c) n++;
    return n;
  });
  return (
    <motion.div ref={cardRef} className="session" style={{ opacity, y: yMV }}>
      <DescentChart
        data={data}
        count={count}
        tint={tint}
        w={300}
        h={56}
        dotR={1.9}
        lineW={2}
        pad={6}
        className="schart"
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// A streaming trail paper. Normally rides straight up its trail slot; if it is
// the paper assigned to a publication row, it lerps out to that row's fig slot
// as the row scrolls into view; the reserved last paper descends into §4.
// ---------------------------------------------------------------------------
// a fig slot's geometry, decoupled from the live (scroll-translated) DOM:
//   cx  — centre x relative to the wrap (constant; the foreground never moves
//         horizontally), cy0 — centre y relative to the wrap WHEN fgY === 0,
//   w   — slot width. The slot's live centre y is then cy0 + fgY(v), computed
//   analytically so we never read a mid-transform rect (which races the
//   foreground's own translate and reads a stale position).
interface FigGeom {
  cx: number;
  cy0: number;
  w: number;
}
interface FigGeomStore {
  pubs: FigGeom[];
  loop: FigGeom | null;
}
interface TrailPaperProps {
  p: MotionValue<number>;
  node: { k: number; x: number; y: number; rot: number };
  seed: number;
  pubIndex: number | null; // which publication row this paper flies to, if any
  isLoop: boolean;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  reportRef: React.RefObject<HTMLDivElement | null>;
  figGeom: React.RefObject<FigGeomStore>;
  pileN: number;
  fgH: number;
  vp: { w: number; h: number };
}
function streamScroll(v: number, pileN: number): number {
  const tr = clamp((v - T.fan[0]) / (1 - T.fan[0]), 0, 1);
  const SPAN = pileN + 16;
  return tr * SPAN; // "lead": how many papers have surfaced
}
/** the foreground's translateY at progress v (mirrors fgY in <Scene/>) */
function fgYAt(v: number, fgH: number, stageH: number): number {
  return lerp(stageH * 0.62, -(fgH - stageH), ease(v, T.text[0], T.text[1]));
}
function TrailPaper({
  p,
  node,
  seed,
  pubIndex,
  isLoop,
  wrapRef,
  reportRef,
  figGeom,
  pileN,
  fgH,
  vp,
}: TrailPaperProps): React.ReactElement {
  const k = node.k;
  const stageH = vp.h - HEADER_OFFSET;
  const spawnY = 0.74 * stageH;

  const state = useTransform(
    p,
    (v): [number, number, number, number, number] => {
      // returns [x, y, rotation(deg), scale, opacity]
      const lead = streamScroll(v, pileN);
      const S = lead * TRAIL_STEP;
      const fgYv = fgYAt(v, fgH, stageH);

      // §4 finale paper: descend into the loop-fig slot, shrink + spin
      if (isLoop) {
        const g = figGeom.current?.loop,
          rep = reportRef.current,
          wrap = wrapRef.current;
        if (!g || !g.w || !rep || !wrap) return [0, 0, 0, 1, 0];
        const a = ease(v, T.loop[0], T.loop[1]);
        if (a <= 0.001) return [0, 0, 0, 1, 0];
        const r = relRect(rep, wrap);
        const figCy = g.cy0 + fgYv;
        const ex = g.cx - r.left - 79,
          ey = figCy - r.top - 103;
        const drop = Math.min(0.42 * vp.h, 360);
        const y = ey - drop * (1 - a);
        const scEnd = clamp(g.w / 158, 0.4, 1);
        const sc = lerp(1, scEnd, a);
        return [ex, y, 360 * a, sc, clamp(a / 0.12, 0, 1)];
      }

      // publication paper: lerp from its stream slot out to the row's fig slot
      if (pubIndex != null) {
        const g = figGeom.current?.pubs[pubIndex],
          rep = reportRef.current,
          wrap = wrapRef.current;
        if (g && g.w && rep && wrap) {
          const H = stageH;
          const figCy = g.cy0 + fgYv;
          // reveal tied to the fig slot, earlier on both ends (mobile-friendly)
          let a = clamp((0.96 * H - figCy) / (0.96 * H - 0.62 * H), 0, 1);
          a = a * a * (3 - 2 * a);
          if (a > 0.001) {
            const r = relRect(rep, wrap);
            const tx = g.cx - r.left - 79,
              ty = figCy - r.top - 103,
              sc = g.w / 158;
            const sx = node.x,
              sy = node.y - S;
            return [
              lerp(sx, tx, a),
              lerp(sy, ty, a),
              lerp(node.rot, 0, a),
              lerp(1, sc, a),
              1,
            ];
          }
        }
      }

      // normal streaming: surface under the previous paper, then ride up
      if (lead < k - 1) return [node.x, node.y - S, node.rot, 1, 0];
      const y = node.y - S;
      let born = clamp(lead - k + 1, 0, 1);
      born = born * born * (3 - 2 * born);
      const fadeUp = clamp((spawnY + y) / 90, 0, 1);
      return [node.x, y, node.rot, 1, born * fadeUp * 0.82];
    },
  );

  const x = useTransform(state, (a) => a[0]);
  const y = useTransform(state, (a) => a[1]);
  const rotate = useTransform(state, (a) => a[2]);
  const scale = useTransform(state, (a) => a[3]);
  const opacity = useTransform(state, (a) => a[4]);
  const zIndex = useTransform(state, (a) =>
    a[3] < 0.999 || pubIndex != null ? 60 : k,
  );

  // §4 loop paper: once it lands, hand rotation off to a CSS animation so it
  // spins forever — a MotionValue can't keep advancing after scrolling stops.
  const [spinning, setSpinning] = useState(false);
  useMotionValueEvent(p, 'change', (v) => {
    if (isLoop) setSpinning(ease(v, T.loop[0], T.loop[1]) >= 0.999);
  });

  if (isLoop) {
    // outer positions/scales; inner card rotates (JS while descending, CSS once
    // landed) — they can't share one element since a CSS transform animation
    // would clobber the motion-driven x/y/scale.
    return (
      <motion.div
        className="pcopy-pos"
        style={{ x, y, scale, opacity, zIndex }}
      >
        <motion.div
          className={spinning ? 'pcopy spin-on' : 'pcopy'}
          style={spinning ? undefined : { rotate }}
        >
          <PaperSVG seed={seed} />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="pcopy"
      style={{ x, y, rotate, scale, opacity, zIndex }}
    >
      <PaperSVG seed={seed} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Scene — composes everything; `children` is the §1–§4 foreground content
// ---------------------------------------------------------------------------
export default function Scene({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const sectionRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const slot0Ref = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const sessionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  const vp = useViewport();
  const { scrollYProgress: p } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  // deterministic scene data (built once)
  const cells = useMemo(() => buildCells(), []);
  const jobs = useMemo(() => buildJobs(cells.length), [cells.length]);
  const trail = useMemo(() => buildTrail(PILE_COUNT, SEED), []);

  // per-cell job events (a cell can host several jobs over time)
  const cellEvents = useMemo(() => {
    const ev: CellEvent[][] = cells.map(() => []);
    for (const j of jobs)
      ev[j.cell].push({ d: j.d, c: j.c, tint: TINTS[j.i % TINTS.length] });
    return ev;
  }, [cells, jobs]);

  // assign a few trail papers to publication rows (and the last to §4)
  const PUB_COUNT = 5;
  const { pubByK, loopK } = useMemo(() => {
    const map: Record<number, number> = {};
    // spread the featured papers across the early/middle of the trail
    for (let j = 0; j < PUB_COUNT; j++) {
      const k = Math.round(6 + j * 7); // k along the trail
      map[k] = j;
    }
    const loop = trail[trail.length - 1].k;
    return { pubByK: map, loopK: loop };
  }, [trail]);

  // ---- fleet box shrink (scales up into the top portion late in the scene) ----
  const stageH = vp.h - HEADER_OFFSET;
  const boxScale = useTransform(
    p,
    (v) => 1 - ease(v, T.shrink[0], T.shrink[1]) * 0.42,
  );
  const boxY = useTransform(
    p,
    (v) => -ease(v, T.shrink[0], T.shrink[1]) * 0.21 * stageH,
  );
  const boxOpacity = useTransform(p, (v) => {
    const sp = ease(v, T.shrink[0], T.shrink[1]);
    const fan = ease(v, T.fan[0], T.fan[1]);
    return (1 - sp * 0.08) * (1 - fan * 0.97);
  });
  const boxBorder = useTransform(p, (v) => {
    const sp = ease(v, T.shrink[0], T.shrink[1]);
    return `rgba(198,198,188,${sp.toFixed(3)})`;
  });

  // ---- report appears, writes itself, then the front paper streams up ----
  const reportOpacity = useTransform(p, (v) => ease(v, T.paper[0], T.paper[1]));
  // report-writing progress (0→1 across the report keyframe band)
  const reportProgress = useTransform(p, (v) =>
    clamp((v - T.report[0]) / (T.report[1] - T.report[0]), 0, 1),
  );
  const frontY = useTransform(
    p,
    (v) => -streamScroll(v, trail.length + 1) * TRAIL_STEP,
  );
  const frontOpacity = useTransform(p, (v) => {
    const S = streamScroll(v, trail.length + 1) * TRAIL_STEP;
    const spawnY = 0.74 * stageH;
    return clamp((spawnY - S) / 90, 0, 1);
  });

  // ---- the §1–§4 foreground scrolls up over the pinned papers ----
  const [fgH, setFgH] = useState(0);
  const figGeom = useRef<FigGeomStore>({ pubs: [], loop: null });
  useLayoutEffect(() => {
    const measure = () => {
      const fg = fgRef.current,
        wrap = wrapRef.current;
      if (!fg || !wrap) return;
      const h = fg.offsetHeight || 0;
      setFgH(h);
      // record each fig slot's geometry decoupled from the live foreground
      // translate: cy0 is its centre y *as if* fgY were 0, so the scene can
      // recompute the live centre analytically (cy0 + fgY(v)) without ever
      // reading a mid-transform rect.
      const stage = vp.h - HEADER_OFFSET;
      const fgYnow = fgYAt(p.get(), h, stage);
      const w = wrap.getBoundingClientRect();
      const geom = (el: Element): FigGeom => {
        const r = el.getBoundingClientRect();
        return {
          cx: r.left + r.width / 2 - w.left,
          cy0: r.top + r.height / 2 - w.top - fgYnow,
          w: r.width,
        };
      };
      const pubs = Array.from(fg.querySelectorAll('.pub-fig')).map(geom);
      const loopEl = fg.querySelector('.loop-fig') as HTMLElement | null;
      figGeom.current = {
        pubs,
        loop: loopEl && loopEl.offsetWidth ? geom(loopEl) : null,
      };
    };
    measure();
    window.addEventListener('resize', measure);
    // The Computer Modern web fonts load from a CDN after first paint and
    // reflow the publication text, shifting every fig slot. Re-measure when
    // they're ready, and observe the foreground for any later reflow, so the
    // flown-in papers always line up with their (now-correct) slots.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && fgRef.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(fgRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [vp.w, vp.h, p]);
  const fgOpacity = useTransform(p, (v) =>
    ease(v, T.text[0], T.text[1]) <= 0.001 ? 0 : 1,
  );
  const fgY = useTransform(p, (v) => {
    const tp = ease(v, T.text[0], T.text[1]);
    const H = stageH;
    return lerp(H * 0.62, -(fgH - H), tp);
  });

  const setSession = (idx: number) => (el: HTMLDivElement | null) => {
    sessionRefs.current[idx] = el;
  };
  const setCell = (idx: number) => (el: HTMLDivElement | null) => {
    cellRefs.current[idx] = el;
  };

  // render clouds with sequential flat cell indices
  let cellCursor = 0;

  return (
    <section
      ref={sectionRef}
      className="scene"
      style={{ minHeight: `${SCENE_VH}vh` }}
    >
      <div className="scene-stage">
        <div ref={wrapRef} className="scene-wrap">
          {/* experiments box */}
          <div className="fleet-box">
            <motion.div
              className="fleet-inner"
              style={{
                scale: boxScale,
                y: boxY,
                opacity: boxOpacity,
                borderColor: boxBorder as unknown as string,
                transformOrigin: '50% 50%',
              }}
            >
              <div className="fleet-cols">
                <div className="fleet-left">
                  {/* slot 0 hosts the docked hero — kept as an invisible spacer */}
                  <div
                    ref={slot0Ref}
                    className="session"
                    style={{ visibility: 'hidden' }}
                  />
                  {Array.from({ length: SESSIONS - 1 }, (_, n) => {
                    const i = n + 1;
                    return (
                      <SessionCard
                        key={i}
                        p={p}
                        i={i}
                        jobs={jobs}
                        cardRef={setSession(i)}
                      />
                    );
                  })}
                </div>
                <div className="fleet-right">
                  {Array.from({ length: CLOUDS }, (_, c) => {
                    const n = CLOUD_SIZES[c % CLOUD_SIZES.length];
                    const start = cellCursor;
                    cellCursor += n;
                    return (
                      <Cloud
                        key={c}
                        p={p}
                        index={c}
                        size={n}
                        startCell={start}
                        cellEvents={cellEvents}
                        setCell={setCell}
                      />
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>

          {/* flow lines (distil sessions → report) */}
          <svg className="flows">
            {Array.from({ length: SESSIONS }, (_, i) => (
              <Flow
                key={i}
                p={p}
                i={i}
                tint={TINTS[i % TINTS.length]}
                sessionRefs={sessionRefs}
                reportRef={reportRef}
                wrapRef={wrapRef}
              />
            ))}
          </svg>

          {/* packets (finished experiments → sessions) */}
          <svg className="packets">
            {jobs.map((job, idx) => (
              <Packet
                key={idx}
                p={p}
                job={job}
                tint={TINTS[job.i % TINTS.length]}
                cellRefs={cellRefs}
                sessionRefs={sessionRefs}
                wrapRef={wrapRef}
              />
            ))}
          </svg>

          {/* the hero descent chart */}
          <SceneHero
            p={p}
            heroRef={heroRef}
            slot0Ref={slot0Ref}
            wrapRef={wrapRef}
            vp={vp}
          />

          {/* the report + its streaming paper trail */}
          <motion.div
            ref={reportRef}
            className="report"
            style={{ opacity: reportOpacity }}
          >
            {trail.map((node) => (
              <TrailPaper
                key={node.k}
                p={p}
                node={node}
                seed={SEED + 200 + node.k * 7}
                pubIndex={pubByK[node.k] ?? null}
                isLoop={node.k === loopK}
                wrapRef={wrapRef}
                reportRef={reportRef}
                figGeom={figGeom}
                pileN={trail.length + 1}
                fgH={fgH}
                vp={vp}
              />
            ))}
            {/* the distilled head paper, which writes itself */}
            <motion.div
              className="pfront"
              style={{ y: frontY, opacity: frontOpacity }}
            >
              <ReportPaper rp={reportProgress} />
            </motion.div>
          </motion.div>

          {/* the §1–§4 foreground scrolls up over the papers */}
          <motion.div
            ref={fgRef}
            className="scene-fg"
            style={{ opacity: fgOpacity, y: fgY, translateX: '-50%' }}
          >
            <div className="scene-fg-inner">{children}</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cloud — a compute node with a grid of GPU cells
// ---------------------------------------------------------------------------
function Cloud({
  p,
  index,
  size,
  startCell,
  cellEvents,
  setCell,
}: {
  p: MotionValue<number>;
  index: number;
  size: number;
  startCell: number;
  cellEvents: CellEvent[][];
  setCell: (idx: number) => (el: HTMLDivElement | null) => void;
}): React.ReactElement {
  const revealAt = lerp(
    T.cloud[0],
    T.cloud[1],
    index / Math.max(1, CLOUDS - 1),
  );
  const opacity = useTransform(p, (v) => (v > revealAt ? 1 : 0));
  const y = useTransform(p, (v) => (v > revealAt ? 0 : 14));
  return (
    <motion.div className="cloud" style={{ opacity, y }}>
      {CloudIcon}
      <div className="cloud-grid">
        {Array.from({ length: size }, (_, k) => {
          const flat = startCell + k;
          return (
            <Gpu
              key={k}
              p={p}
              events={cellEvents[flat] || []}
              cellRef={setCell(flat)}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
