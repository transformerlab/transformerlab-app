import React, { useState } from 'react';
import styles from './ParetoFrontierDiagram.module.css';

// ledger: 1.5B frontier points = E18; 1.5B knee (distinct>=0.5 up to reward~0.47) = E19;
//         3B frontier points = E20; 3B knee (reward 0.61 at distinct 0.70) = E21;
//         3B dominates 1.5B, e.g. reward~0.6 -> 0.70 (3B) vs ~0.42 (1.5B) = E22.

type Pt = { reward: number; distinct: number };

const F15: Pt[] = [
  { reward: 0.25, distinct: 1.0 },
  { reward: 0.35, distinct: 0.89 },
  { reward: 0.47, distinct: 0.51 },
  { reward: 0.52, distinct: 0.42 },
  { reward: 0.58, distinct: 0.42 },
  { reward: 0.69, distinct: 0.4 },
  { reward: 0.75, distinct: 0.24 },
  { reward: 0.86, distinct: 0.19 },
  { reward: 0.9, distinct: 0.08 },
  { reward: 1.0, distinct: 0.02 },
];

const F3: Pt[] = [
  { reward: 0.42, distinct: 1.0 },
  { reward: 0.53, distinct: 0.98 },
  { reward: 0.57, distinct: 0.74 },
  { reward: 0.61, distinct: 0.7 },
  { reward: 0.69, distinct: 0.38 },
  { reward: 0.72, distinct: 0.31 },
  { reward: 0.98, distinct: 0.25 },
  { reward: 1.0, distinct: 0.11 },
];

const KNEE_15: Pt = { reward: 0.47, distinct: 0.51 };
const KNEE_3: Pt = { reward: 0.61, distinct: 0.7 };

// plot geometry
const W = 460;
const H = 300;
const PAD_L = 48;
const PAD_B = 40;
const PAD_T = 16;
const PAD_R = 16;
const px = (reward: number): number => PAD_L + reward * (W - PAD_L - PAD_R);
const py = (distinct: number): number =>
  H - PAD_B - distinct * (H - PAD_T - PAD_B);

function path(pts: Pt[]): string {
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.reward)} ${py(p.distinct)}`)
    .join(' ');
}

export default function ParetoFrontierDiagram(): React.ReactElement {
  const [model, setModel] = useState<'b15' | 'b3'>('b15');
  const active = model === 'b15' ? F15 : F3;
  const knee = model === 'b15' ? KNEE_15 : KNEE_3;
  const accent = model === 'b15' ? 'var(--ifm-color-primary)' : '#e08a3c';

  const gridY = [0, 0.25, 0.5, 0.75, 1.0];
  const gridX = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button
          className={
            model === 'b15' ? `${styles.button} ${styles.on}` : styles.button
          }
          onClick={() => setModel('b15')}
        >
          1.5B model
        </button>
        <button
          className={
            model === 'b3' ? `${styles.button} ${styles.onAlt}` : styles.button
          }
          onClick={() => setModel('b3')}
        >
          3B model
        </button>
      </div>

      <svg
        className={styles.plot}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Variety versus reward trade-off curves for the 1.5B and 3B models"
      >
        {gridY.map((g) => (
          <g key={`gy${g}`}>
            <line
              x1={PAD_L}
              y1={py(g)}
              x2={W - PAD_R}
              y2={py(g)}
              className={styles.grid}
            />
            <text
              x={PAD_L - 8}
              y={py(g) + 4}
              className={styles.axisLabel}
              textAnchor="end"
            >
              {g.toFixed(2)}
            </text>
          </g>
        ))}
        {gridX.map((g) => (
          <text
            key={`gx${g}`}
            x={px(g)}
            y={H - PAD_B + 18}
            className={styles.axisLabel}
            textAnchor="middle"
          >
            {g.toFixed(2)}
          </text>
        ))}
        <text
          x={(W + PAD_L) / 2}
          y={H - 6}
          className={styles.axisTitle}
          textAnchor="middle"
        >
          Reward (solvable and in difficulty band)
        </text>
        <text
          x={-(H - PAD_B + PAD_T) / 2}
          y={14}
          className={styles.axisTitle}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          Variety (distinct valid levels)
        </text>

        {/* the inactive curve, faint, for comparison */}
        <path
          d={path(model === 'b15' ? F3 : F15)}
          className={styles.ghostLine}
        />

        {/* active curve */}
        <path
          d={path(active)}
          className={styles.activeLine}
          style={{ stroke: accent }}
        />
        {active.map((p, i) => (
          <circle
            key={i}
            cx={px(p.reward)}
            cy={py(p.distinct)}
            r={3.5}
            style={{ fill: accent }}
          />
        ))}

        {/* knee marker */}
        <circle
          cx={px(knee.reward)}
          cy={py(knee.distinct)}
          r={7}
          className={styles.knee}
        />
        <text
          x={px(knee.reward) + 12}
          y={py(knee.distinct) - 8}
          className={styles.kneeLabel}
        >
          knee: keep variety {knee.distinct.toFixed(2)} at reward{' '}
          {knee.reward.toFixed(2)}
        </text>
      </svg>

      <p className={styles.caption}>
        Toggle the model. Each dot is a snapshot of the model at some point in
        training, and you can pick one by stopping there. The curve slopes down
        because more reward costs variety, so you want to sit as far up and to
        the right as you can, where both stay high. The 3B curve sits above the
        1.5B curve almost everywhere, so the larger model keeps more of its
        variety at the same reward. The circled knee is the cheap passive
        control: stop there and the model is still varied.
      </p>
    </div>
  );
}
