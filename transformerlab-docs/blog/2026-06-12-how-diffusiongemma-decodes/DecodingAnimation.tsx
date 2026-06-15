import React, { useEffect, useState } from 'react';
import styles from './DecodingAnimation.module.css';

// An 8x4 grid of 32 "tokens". Both panels produce the same canvas, but they show
// the two mental models people have for how the text gets written.
const COLS = 8;
const ROWS = 4;
const N = COLS * ROWS; // 32 = 2^5

// How we picture autoregression: one token at a time, strictly left-to-right,
// top-to-bottom. Token i is written on step i, so there are N steps in total.
const AR_TOTAL_STEPS = N;

// How we picture diffusion: boxes pop in at totally random spots all over the
// canvas, a couple at a time, until it is full -- there is no left-to-right (or
// any) order. We build the random order with a seeded shuffle so it is genuinely
// scattered in 2D yet deterministic, rendering identically on the server and the
// client (no hydration mismatch).
function shuffledOrder(seed: number): number[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const DIFF_ORDER: number[] = shuffledOrder(0x9e3779b9);
const DIFF_PER_STEP = 2; // boxes that pop in each step
const DIFF_TOTAL_STEPS = Math.ceil(N / DIFF_PER_STEP); // 16

const TICK_MS = 320;
const HOLD_TICKS = 6; // pause at the end before looping

// Map a 0..1 progress value to a hue ramp (blue -> violet -> magenta) so the
// left-to-right sweep is legible at a glance.
function hueForPosition(fraction: number): string {
  const hue = 210 + fraction * 130;
  return `hsl(${hue}, 68%, 54%)`;
}

function ARPanel({ frame }: { frame: number }) {
  const done = frame > AR_TOTAL_STEPS;
  const currentStep = Math.min(frame, AR_TOTAL_STEPS);
  const revealed = Math.min(frame, N);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>
          Left-to-right (autoregressive)
        </span>
        <span className={styles.stepCounter}>
          {done
            ? `done in ${AR_TOTAL_STEPS} steps`
            : `step ${currentStep} / ${AR_TOTAL_STEPS}`}
        </span>
      </div>
      <div className={styles.subtitle}>
        How we picture autoregression: one token at a time, strictly left to
        right.
      </div>
      <div className={styles.grid}>
        {Array.from({ length: N }, (_, i) => {
          const committed = i < frame; // token i written on step i
          const justNow = i === frame - 1;
          return (
            <div
              key={i}
              className={`${styles.cell} ${committed ? '' : styles.masked} ${
                justNow ? styles.justCommitted : ''
              }`}
              style={
                committed
                  ? { backgroundColor: hueForPosition(i / (N - 1)) }
                  : undefined
              }
            >
              {committed ? i + 1 : ''}
            </div>
          );
        })}
      </div>
      <div
        className={styles.stepCounter}
        style={{ marginTop: '0.4rem', display: 'block' }}
      >
        {revealed} / {N} tokens written
      </div>
    </div>
  );
}

function DiffusionPanel({ frame }: { frame: number }) {
  const done = frame > DIFF_TOTAL_STEPS;
  const currentStep = Math.min(frame, DIFF_TOTAL_STEPS);
  // rank[position] = the step on which that position pops in.
  const rank = new Array<number>(N);
  DIFF_ORDER.forEach((pos, k) => {
    rank[pos] = Math.floor(k / DIFF_PER_STEP) + 1;
  });
  const revealed = DIFF_ORDER.slice(
    0,
    Math.min(frame, DIFF_TOTAL_STEPS) * DIFF_PER_STEP,
  ).length;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Diffusion</span>
        <span className={styles.stepCounter}>
          {done
            ? `done in ${DIFF_TOTAL_STEPS} steps`
            : `step ${currentStep} / ${DIFF_TOTAL_STEPS}`}
        </span>
      </div>
      <div className={styles.subtitle}>
        How we picture diffusion: tokens pop in at random spots all over the
        canvas, in no order at all.
      </div>
      <div className={styles.grid}>
        {Array.from({ length: N }, (_, i) => {
          const committed = rank[i] <= frame;
          const justNow = rank[i] === frame; // popped in this step
          return (
            <div
              key={i}
              className={`${styles.cell} ${committed ? '' : styles.masked} ${
                justNow ? styles.justCommitted : ''
              }`}
              // Single accent hue for every cell -- no left-to-right order.
              style={
                committed
                  ? { backgroundColor: 'var(--ifm-color-primary)' }
                  : undefined
              }
            />
          );
        })}
      </div>
      <div
        className={styles.stepCounter}
        style={{ marginTop: '0.4rem', display: 'block' }}
      >
        {revealed} / {N} tokens filled in
      </div>
    </div>
  );
}

export default function DecodingAnimation(): React.ReactElement {
  const maxFrame = AR_TOTAL_STEPS + 1;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let hold = 0;
    const id = setInterval(() => {
      setFrame((f) => {
        if (f > maxFrame) {
          hold += 1;
          if (hold >= HOLD_TICKS) {
            hold = 0;
            return 0;
          }
          return f;
        }
        return f + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, maxFrame]);

  const restart = () => {
    setFrame(0);
    setPlaying(true);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.panels}>
        <ARPanel frame={frame} />
        <DiffusionPanel frame={frame} />
      </div>
      <div className={styles.controls}>
        <button className={styles.button} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button className={styles.button} onClick={restart}>
          Restart
        </button>
        <span className={styles.caption}>
          The same output, two mental models. Left-to-right writes one box at a
          time; diffusion fills the canvas in no particular order. This post is
          about which one the real model actually resembles.
        </span>
      </div>
    </div>
  );
}
