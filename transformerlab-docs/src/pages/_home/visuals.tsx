/*
 * visuals.tsx — small presentational SVG pieces shared by the page and scene:
 *   <Logo/>          the Transformer Lab mark
 *   <PaperSVG/>      a seeded, algorithmically-varied caricature of a paper
 *   <DescentChart/>  a best-so-far line chart that grows with a count MotionValue
 *   <ReportPaper/>   the head paper that "writes itself" with a progress MV
 *
 * None of these touch the DOM imperatively — animation is driven by the
 * MotionValues passed in from <Scene/>.
 */
import React, { useMemo } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import {
  rng,
  ease,
  descentPath,
  descentX,
  descentY,
  DOT_COLOR,
  DOT_STROKE,
  GREEN,
  SEED,
  type DescentData,
} from './data';

// ---- brand mark ----
export function Logo({
  width = 20,
  height = 23,
}: {
  width?: number;
  height?: number;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 33.866669 38.741112"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width, height }}
    >
      <g transform="translate(-91.545824,-129.11667)">
        <g transform="translate(44.593277,-105.58143)">
          <path
            strokeWidth="2.11667"
            transform="translate(-181.12086,-85.545272)"
            d="m 260.88176,330.4858 v 18.25625 m -15.84268,-27.44034 15.81037,9.12812 m -31.68537,0 15.81037,-9.12813 m -15.8427,27.44034 v -18.25625 m 15.84268,27.44034 -15.81037,-9.12812 m 31.68537,0 -15.81037,9.12813"
          />
          <path
            strokeWidth="1.85208"
            transform="translate(-181.12086,-85.545272)"
            d="m 245.00676,330.4858 v 18.25625 m 7.9375,-18.25625 v 18.25625 m -15.84268,-13.69219 15.81037,9.12813 m -11.84162,-16.00221 15.81037,9.12813 m -19.77912,6.87407 15.81037,-9.12812 m -19.77912,2.25404 15.81037,-9.12812 m -3.93645,20.56626 v -18.25625 m -7.9375,18.25625 v -18.25625 m 15.84268,13.69219 -15.81037,-9.12813 m 11.84162,16.00221 -15.81037,-9.12813 m 19.77912,-6.87407 -15.81037,9.12812 m 19.77912,-2.25404 -15.81037,9.12812"
          />
        </g>
      </g>
    </svg>
  );
}

// ---- a figure dropped into a caricature paper ----
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}
function figureEls(
  x: number,
  y: number,
  w: number,
  h: number,
  type: 'descent' | 'bars',
  green: string,
  seed: number,
): React.ReactNode[] {
  const els: React.ReactNode[] = [];
  els.push(
    <rect
      key="frame"
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill="#fcfcf9"
      stroke="#e4e4dc"
      strokeWidth={1}
    />,
  );
  els.push(
    <rect
      key="cap"
      x={x + w * 0.12}
      y={y + h + 4}
      width={w * 0.76}
      height={2.4}
      rx={1}
      fill="#cfcfc6"
    />,
  );
  const pad = 9,
    px = x + pad,
    py = y + pad,
    pw = w - 2 * pad,
    ph = h - 2 * pad,
    rnd = rng(seed);
  if (type === 'descent') {
    let d = 'M ' + px + ' ' + (py + ph * 0.1);
    const pts = 6;
    for (let i = 1; i <= pts; i++) {
      d +=
        ' H ' +
        (px + pw * (i / pts)).toFixed(1) +
        ' V ' +
        (py + ph * (0.1 + 0.74 * (i / pts))).toFixed(1);
    }
    for (let k = 0; k < 11; k++)
      els.push(
        <circle
          key={'d' + k}
          cx={(px + pw * rnd()).toFixed(1)}
          cy={(py + ph * (0.08 + 0.84 * rnd())).toFixed(1)}
          r={1.1}
          fill="#d2d3c9"
        />,
      );
    els.push(
      <path
        key="line"
        d={d}
        fill="none"
        stroke={green}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />,
    );
  } else {
    const bw = pw / 6;
    for (let b = 0; b < 6; b++) {
      const bh = ph * (0.32 + 0.62 * (((b * 7) % 5) / 5));
      els.push(
        <rect
          key={'b' + b}
          x={(px + b * bw + 1).toFixed(1)}
          y={(py + ph - bh).toFixed(1)}
          width={(bw - 2).toFixed(1)}
          height={bh.toFixed(1)}
          rx={1}
          fill={b % 2 ? green : '#c2cad2'}
        />,
      );
    }
  }
  return els;
}

/** A seeded, varied caricature of the distilled paper (title + body + figures). */
export function PaperSVG({ seed }: { seed: number }): React.ReactElement {
  const PW = 300,
    PH = 392;
  const titleC = '#b6b6ad',
    textC = '#d2d2c9',
    figGreen = '#b3b3aa';
  const R = rng(seed);
  const bars: Rect[] = [];
  const bar = (x: number, y: number, w: number, h: number, fill: string) =>
    bars.push({ x, y, w, h, fill });

  let tw = 150 + R() * 60,
    y = 56;
  bar(PW / 2 - tw / 2, 34, tw, 13, titleC);
  if (R() < 0.7) {
    const tw2 = 96 + R() * 64;
    bar(PW / 2 - tw2 / 2, y, tw2, 13, titleC);
    y += 22;
  }
  const sw = 52 + R() * 48;
  bar(PW / 2 - sw / 2, y, sw, 7, textC);

  const x = 34,
    w0 = PW - 68;
  y = Math.max(y + 22, 104);
  const nLines = 6 + Math.floor(R() * 5),
    nFig = R() < 0.22 ? 0 : R() < 0.74 ? 1 : 2;
  const figRows: number[] = [];
  while (figRows.length < nFig) {
    const fr = 1 + Math.floor(R() * (nLines - 1));
    if (figRows.indexOf(fr) < 0) figRows.push(fr);
  }
  const figs: React.ReactNode[] = [];
  for (let i = 0; i < nLines && y < PH - 22; i++) {
    const w = i % 3 === 2 ? w0 * (0.4 + 0.22 * R()) : w0 * (0.76 + 0.22 * R());
    bar(x, y, w, 8, textC);
    y += 17;
    if (figRows.indexOf(i) >= 0 && y < PH - 70) {
      const type: 'descent' | 'bars' = R() < 0.55 ? 'descent' : 'bars';
      const fh = type === 'descent' ? 70 + R() * 24 : 42 + R() * 16;
      figs.push(
        <g key={'fig' + i}>
          {figureEls(x, y, w0, fh, type, figGreen, seed + 31 + i)}
        </g>,
      );
      y += fh + 12;
    }
  }

  return (
    <svg
      className="paper-svg"
      viewBox={`0 0 ${PW} ${PH}`}
      preserveAspectRatio="none"
    >
      {bars.map((b, i) => (
        <rect
          key={'r' + i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={b.h / 2}
          fill={b.fill}
        />
      ))}
      {figs}
    </svg>
  );
}

// ---- the head paper that "writes itself" (report-progress driven) ----
interface ReportLineSpec {
  x: number;
  y: number;
  w: number; // written width
  w2: number; // rewritten width (if revised)
  h: number;
  fill: string;
  order: number;
  rev: { del: number; rew: number } | null; // revision window, in report-progress
}
interface ReportFigSpec {
  type: 'descent' | 'bars';
  x: number;
  y: number;
  w: number;
  h: number;
  addAt: number; // report-progress at which the figure drops in
  seed: number;
}
interface ReportLayout {
  PW: number;
  PH: number;
  lines: ReportLineSpec[];
  figs: ReportFigSpec[];
  N: number;
}
function buildReport(seed: number): ReportLayout {
  const PW = 300,
    PH = 392;
  const titleC = '#b6b6ad',
    textC = '#d2d2c9';
  const lines: ReportLineSpec[] = [];
  let order = 0;
  const add = (x: number, y: number, w: number, h: number, fill: string) =>
    lines.push({ x, y, w, w2: w, h, fill, order: order++, rev: null });
  const R = rng(seed + 5);
  const x = 34,
    w0 = PW - 68;
  // title: two thick centred bars + a short subtitle
  add(PW / 2 - 96, 34, 192, 13, titleC);
  add(PW / 2 - 64, 56, 128, 13, titleC);
  add(PW / 2 - 34, 78, 68, 7, textC);
  // body: thick grey lines with two figures dropped in
  let y = 104;
  const figs: ReportFigSpec[] = [];
  for (let i = 0; i < 7; i++) {
    const w = i % 3 === 2 ? w0 * (0.4 + 0.2 * R()) : w0 * (0.82 + 0.18 * R());
    add(x, y, w, 8, textC);
    y += 17;
    if (i === 2) {
      figs.push({
        type: 'descent',
        x,
        y,
        w: w0,
        h: 82,
        addAt: 0.44,
        seed: seed + 9 + Math.round(y),
      });
      y += 82 + 12;
    }
    if (i === 5) {
      figs.push({
        type: 'bars',
        x,
        y,
        w: w0,
        h: 48,
        addAt: 0.64,
        seed: seed + 9 + Math.round(y),
      });
      y += 48 + 10;
    }
  }
  // a couple of body lines get deleted & rewritten (shorter)
  const body = lines.filter((L) => L.order > 3);
  for (let r = 0; r < 2 && r < body.length; r++) {
    const L = body[Math.floor(body.length * 0.4) + r];
    const d = 0.5 + r * 0.04;
    L.rev = { del: d, rew: d + 0.08 };
    L.w2 = L.w * (0.55 + 0.4 * R());
  }
  return { PW, PH, lines, figs, N: lines.length };
}
/** width of a line at report-progress rp: writes in order, may delete+rewrite */
function lineWidth(L: ReportLineSpec, rp: number, N: number): number {
  const writeAt = (L.order / N) * 0.6;
  if (L.rev && rp >= L.rev.del && rp < L.rev.rew) return 0; // deleted
  if (L.rev && rp >= L.rev.rew)
    return L.w2 * ease(rp, L.rev.rew, L.rev.rew + 0.03); // rewritten
  return rp >= writeAt ? L.w * ease(rp, writeAt, writeAt + 0.03) : 0; // written
}
function ReportLine({
  L,
  rp,
  N,
}: {
  L: ReportLineSpec;
  rp: MotionValue<number>;
  N: number;
}): React.ReactElement {
  const width = useTransform(rp, (v) => lineWidth(L, v, N));
  return (
    <motion.rect
      x={L.x}
      y={L.y}
      height={L.h}
      rx={L.h / 2}
      fill={L.fill}
      width={width}
    />
  );
}
function ReportFig({
  fig,
  rp,
}: {
  fig: ReportFigSpec;
  rp: MotionValue<number>;
}): React.ReactElement {
  const opacity = useTransform(rp, (v) => ease(v, fig.addAt, fig.addAt + 0.05));
  const yOff = useTransform(
    rp,
    (v) => (1 - ease(v, fig.addAt, fig.addAt + 0.05)) * 7,
  );
  return (
    <motion.g style={{ opacity, y: yOff }}>
      <>{figureEls(fig.x, fig.y, fig.w, fig.h, fig.type, GREEN, fig.seed)}</>
    </motion.g>
  );
}
/**
 * The distilled head paper that writes itself: lines appear in order, two get
 * deleted and rewritten shorter, and two figures drop in — all a pure function
 * of the report-progress MotionValue `rp` (0→1 over the report keyframe band).
 */
export function ReportPaper({
  rp,
  seed = SEED + 5,
}: {
  rp: MotionValue<number>;
  seed?: number;
}): React.ReactElement {
  const { PW, PH, lines, figs, N } = useMemo(() => buildReport(seed), [seed]);
  return (
    <svg
      className="paper-svg"
      viewBox={`0 0 ${PW} ${PH}`}
      preserveAspectRatio="none"
    >
      {lines.map((L) => (
        <ReportLine key={L.order} L={L} rp={rp} N={N} />
      ))}
      {figs.map((f) => (
        <ReportFig key={f.seed} fig={f} rp={rp} />
      ))}
    </svg>
  );
}

// ---- best-so-far descent chart, grown by a count MotionValue ----
function Dot({
  k,
  cx,
  cy,
  r,
  count,
}: {
  k: number;
  cx: number;
  cy: number;
  r: number;
  count: MotionValue<number>;
}): React.ReactElement {
  const opacity = useTransform(count, (c) => (k < c ? 1 : 0));
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={DOT_COLOR}
      stroke={DOT_STROKE}
      strokeWidth={0.7}
      style={{ opacity }}
    />
  );
}

export function DescentChart({
  data,
  count,
  tint,
  w,
  h,
  dotR,
  lineW,
  pad,
  className,
}: {
  data: DescentData;
  count: MotionValue<number>;
  tint: string;
  w: number;
  h: number;
  dotR: number;
  lineW: number;
  pad: number;
  className?: string;
}): React.ReactElement {
  const d = useTransform(count, (c) =>
    descentPath(data, Math.round(c), w, h, pad, pad, pad, pad),
  );
  const leadX = useTransform(count, (c) => {
    const n = clampInt(Math.round(c), 0, data.K);
    return n <= 0 ? 0 : descentX(n - 1, data.K, w, pad, pad);
  });
  const leadY = useTransform(count, (c) => {
    const n = clampInt(Math.round(c), 0, data.K);
    return n <= 0 ? 0 : descentY(data.mins[n - 1], h, pad, pad);
  });
  const leadOpacity = useTransform(count, (c) => (Math.round(c) > 0 ? 1 : 0));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <g>
        {data.trials.map((_, k) => (
          <Dot
            key={k}
            k={k}
            cx={descentX(k, data.K, w, pad, pad)}
            cy={descentY(data.trials[k], h, pad, pad)}
            r={dotR}
            count={count}
          />
        ))}
      </g>
      <motion.path
        d={d}
        fill="none"
        stroke={tint}
        strokeWidth={lineW}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <motion.circle
        cx={leadX}
        cy={leadY}
        r={dotR * 1.5}
        fill={tint}
        style={{ opacity: leadOpacity }}
      />
    </svg>
  );
}

function clampInt(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
