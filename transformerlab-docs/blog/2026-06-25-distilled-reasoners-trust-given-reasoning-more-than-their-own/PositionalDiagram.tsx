import React, { useState } from 'react';
import styles from './PositionalDiagram.module.css';

// ledger: positional means + frac load-bearing for the 1.5B model's generated GSM8K CoT = B7.
//   early 0.47 / 19%, mid 1.17 / 34%, late 2.74 / 64%. Load-bearing threshold = 1 nat.
type Bin = { label: string; effect: number; frac: number };
const BINS: Bin[] = [
  { label: 'Early third', effect: 0.47, frac: 0.19 },
  { label: 'Middle third', effect: 1.17, frac: 0.34 },
  { label: 'Late third', effect: 2.74, frac: 0.64 },
];

const W = 460;
const H = 300;
const PAD_L = 52;
const PAD_B = 46;
const PAD_T = 20;
const EFFECT_MAX = 3.0;

export default function PositionalDiagram() {
  const [mode, setMode] = useState<'effect' | 'frac'>('effect');
  const plotW = W - PAD_L - 20;
  const plotH = H - PAD_B - PAD_T;
  const bw = plotW / BINS.length;
  const val = (b: Bin) => (mode === 'effect' ? b.effect / EFFECT_MAX : b.frac);
  const fmt = (b: Bin) =>
    mode === 'effect'
      ? `${b.effect.toFixed(2)} nats`
      : `${Math.round(b.frac * 100)}%`;
  const thrY = PAD_T + plotH * (1 - 1.0 / EFFECT_MAX); // 1-nat load-bearing line

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <button
          className={mode === 'effect' ? styles.active : ''}
          onClick={() => setMode('effect')}
        >
          Mean effect
        </button>
        <button
          className={mode === 'frac' ? styles.active : ''}
          onClick={() => setMode('frac')}
        >
          Fraction load-bearing
        </button>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Causal effect of corrupting a reasoning step, by position in the chain-of-thought."
      >
        {/* y axis */}
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + plotH}
          stroke="#999"
        />
        <line
          x1={PAD_L}
          y1={PAD_T + plotH}
          x2={W - 20}
          y2={PAD_T + plotH}
          stroke="#999"
        />
        {/* threshold line (effect mode only) */}
        {mode === 'effect' && (
          <g>
            <line
              x1={PAD_L}
              y1={thrY}
              x2={W - 20}
              y2={thrY}
              stroke="#c0504d"
              strokeDasharray="4 3"
            />
            <text
              x={PAD_L + 4}
              y={thrY - 5}
              textAnchor="start"
              className={styles.thr}
            >
              load-bearing threshold (1 nat)
            </text>
          </g>
        )}
        {BINS.map((b, i) => {
          const h = plotH * val(b);
          const x = PAD_L + i * bw + bw * 0.18;
          const y = PAD_T + plotH - h;
          return (
            <g key={b.label}>
              <rect
                x={x}
                y={y}
                width={bw * 0.64}
                height={h}
                rx={3}
                className={
                  mode === 'effect' ? styles.barEffect : styles.barFrac
                }
              />
              <text
                x={x + bw * 0.32}
                y={y - 6}
                textAnchor="middle"
                className={styles.val}
              >
                {fmt(b)}
              </text>
              <text
                x={x + bw * 0.32}
                y={PAD_T + plotH + 18}
                textAnchor="middle"
                className={styles.lbl}
              >
                {b.label}
              </text>
            </g>
          );
        })}
        <text
          x={14}
          y={PAD_T + plotH / 2}
          transform={`rotate(-90 14 ${PAD_T + plotH / 2})`}
          textAnchor="middle"
          className={styles.axis}
        >
          {mode === 'effect' ? 'Mean effect (nats)' : 'Fraction load-bearing'}
        </text>
      </svg>
      <p className={styles.caption}>
        DeepSeek-R1-Distill-Qwen-1.5B, self-generated GSM8K reasoning. Both the
        average effect of corrupting a step and the share of steps that clear
        the load-bearing bar rise from the start of the chain to the end.
      </p>
    </div>
  );
}
