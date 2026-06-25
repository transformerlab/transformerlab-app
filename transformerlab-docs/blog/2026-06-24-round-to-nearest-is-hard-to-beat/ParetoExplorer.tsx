import React, { useState } from 'react';
import styles from './ParetoExplorer.module.css';

// ledger: RTN 4-bit 0.8902 @19.33GB, 58 t/s (E2,E6,E8); mixed_4_8 0.9024 @20.53GB, 76 t/s, ties p=0.79 (E31,E32,B3);
//   streaming-GPTQ 0.8841 @19.33GB, 58 t/s, ties p=1.000 (E18,E27); uniform 5-bit 0.900 (HE-50) @22.82GB, over budget @32K (E9);
//   mixed_3_4 0.880 (HE-50) @14.81GB (E10); custom per-expert 0.880 (HE-50) @12.68GB (E14); 24 GB cap (E5/E7 context).

type Build = {
  name: string;
  score: number;
  mem: number;
  full: boolean; // scored on the full HumanEval-164 (comparable) vs the HE-50 screening subset
  baseline?: boolean;
  verdict: string;
};

const BUILDS: Build[] = [
  {
    name: 'RTN 4-bit',
    score: 0.8902,
    mem: 19.33,
    full: true,
    baseline: true,
    verdict:
      'The baseline. The simplest quantization there is: round each weight to the nearest value, no data, no tuning. This is the one to beat.',
  },
  {
    name: 'mixed_4_8 (higher-bit)',
    score: 0.9024,
    mem: 20.53,
    full: true,
    verdict:
      'Spends more bits and about 1.2 GB more memory than RTN, yet ties it (p = 0.79). The extra spend buys no measurable gain.',
  },
  {
    name: 'streaming-GPTQ (calibrated)',
    score: 0.8841,
    mem: 19.33,
    full: true,
    verdict:
      'The strongest method we tested, and a statistical tie with RTN (p = 1.000). Calibration data did not help here. Its memory and speed match RTN by construction, since it produces a 4-bit model.',
  },
  {
    name: 'uniform 5-bit',
    score: 0.9,
    mem: 22.82,
    full: false,
    verdict:
      'Screening-subset score. Spills over the 24 GB budget once a real 32K-token turn is included, so it fails the hard cap.',
  },
  {
    name: 'mixed_3_4',
    score: 0.88,
    mem: 14.81,
    full: false,
    verdict:
      'Screening-subset score. Smaller than RTN, but measurably below it on coding.',
  },
  {
    name: 'custom per-expert',
    score: 0.88,
    mem: 12.68,
    full: false,
    verdict:
      'Screening-subset score. The smallest build, tuned to this model’s layout. It ties the other low-bit build, so it was not worth promoting.',
  },
];

const X_MIN = 12;
const X_MAX = 25;
const Y_MIN = 0.87;
const Y_MAX = 0.93;
const W = 640;
const H = 360;
const PAD = { l: 58, r: 16, t: 18, b: 46 };

function sx(mem: number): number {
  return PAD.l + ((mem - X_MIN) / (X_MAX - X_MIN)) * (W - PAD.l - PAD.r);
}
function sy(score: number): number {
  return PAD.t + (1 - (score - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b);
}

export default function ParetoExplorer(): JSX.Element {
  const [sel, setSel] = useState(0);
  const capX = sx(24);
  const yTicks = [0.87, 0.88, 0.89, 0.9, 0.91, 0.92, 0.93];
  const xTicks = [12, 14, 16, 18, 20, 22, 24];

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        Every build we tried, by coding score and memory
      </div>

      <svg
        className={styles.svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Scatter plot of coding score versus peak memory for each quantized build"
      >
        {/* gridlines + y labels */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={sy(t)}
              y2={sy(t)}
              className={styles.grid}
            />
            <text
              x={PAD.l - 8}
              y={sy(t) + 4}
              className={styles.axisLabel}
              textAnchor="end"
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {/* x labels */}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={H - PAD.b + 20}
            className={styles.axisLabel}
            textAnchor="middle"
          >
            {t}
          </text>
        ))}

        {/* 24 GB cap line */}
        <line
          x1={capX}
          x2={capX}
          y1={PAD.t}
          y2={H - PAD.b}
          className={styles.capLine}
        />
        <text
          x={capX - 6}
          y={PAD.t + 12}
          className={styles.capLabel}
          textAnchor="end"
        >
          24 GB cap
        </text>

        {/* axis titles */}
        <text
          x={(W + PAD.l) / 2}
          y={H - 6}
          className={styles.axisTitle}
          textAnchor="middle"
        >
          Peak memory (GB)
        </text>
        <text
          x={-(H - PAD.b + PAD.t) / 2}
          y={16}
          className={styles.axisTitle}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          Coding score
        </text>

        {/* points */}
        {BUILDS.map((b, i) => {
          const selected = i === sel;
          const cls = [
            styles.dot,
            b.full ? styles.dotFull : styles.dotScreen,
            b.baseline ? styles.dotBaseline : '',
            selected ? styles.dotSelected : '',
          ].join(' ');
          return (
            <circle
              key={b.name}
              cx={sx(b.mem)}
              cy={sy(b.score)}
              r={selected ? 11 : 7}
              className={cls}
              onClick={() => setSel(i)}
            />
          );
        })}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legFull}>
          ● full HumanEval-164 (comparable)
        </span>
        <span className={styles.legScreen}>● HE-50 screening subset</span>
      </div>

      <div className={styles.buttons}>
        {BUILDS.map((b, i) => (
          <button
            key={b.name}
            className={`${styles.btn} ${i === sel ? styles.btnActive : ''}`}
            onClick={() => setSel(i)}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className={styles.verdict}>
        <strong>{BUILDS[sel].name}.</strong> {BUILDS[sel].verdict}
      </div>

      <div className={styles.caption}>
        The three builds scored on the full test (RTN 4-bit, the higher-bit
        mixed build, and calibrated streaming-GPTQ) land on top of each other.
        Nothing in the 24 GB budget beats plain round-to-nearest 4-bit.
      </div>
    </div>
  );
}
