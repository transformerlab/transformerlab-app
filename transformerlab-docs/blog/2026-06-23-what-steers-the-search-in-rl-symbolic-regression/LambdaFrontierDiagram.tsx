import React, { useState } from 'react';
import styles from './LambdaFrontierDiagram.module.css';

// ledger: unique structures 144/67/31/16/3 across lambda 0/0.005/0.01/0.02/0.05 = E5.
//         mean complexity 7.7 -> 1.0 over the same sweep = E6 (only endpoints recorded).
const LAMBDAS = [0, 0.005, 0.01, 0.02, 0.05];
const UNIQUE = [144, 67, 31, 16, 3]; // E5 — unique expression structures explored (summed over 3 seeds)
const COMPLEXITY = ['7.7', '—', '—', '—', '1.0']; // E6 — only the endpoints were recorded
const MAX_UNIQUE = 144;

export default function LambdaFrontierDiagram(): React.ReactElement {
  const [i, setI] = useState(0);
  const unique = UNIQUE[i];
  const widthPct = (unique / MAX_UNIQUE) * 100;
  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <label className={styles.label} htmlFor="lambda-slider">
          Simplicity penalty &lambda; = <strong>{LAMBDAS[i]}</strong>
        </label>
        <input
          id="lambda-slider"
          className={styles.slider}
          type="range"
          min={0}
          max={LAMBDAS.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
        />
        <div className={styles.ticks}>
          {LAMBDAS.map((l, k) => (
            <span key={l} className={k === i ? styles.tickActive : styles.tick}>
              {l}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.metric}>
        <div className={styles.metricLabel}>
          Distinct equation shapes the policy tried
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${widthPct}%` }} />
          <span className={styles.fillNum}>{unique}</span>
        </div>
      </div>

      <div className={styles.readouts}>
        <div className={styles.readout}>
          <span className={styles.readoutNum}>{COMPLEXITY[i]}</span>
          <span className={styles.readoutCap}>avg. equation size (parts)</span>
        </div>
      </div>

      <p className={styles.note}>
        Turn up the simplicity penalty and exploration shrinks: from 144
        distinct equation shapes down to 3, with the average equation size
        falling from 7.7 parts to 1.0. The penalty is a clean dial on how widely
        the model searches. (A dash means that middle value was not measured;
        only the endpoints were.)
      </p>
    </div>
  );
}
