import React from 'react';
import styles from './ControlLadderDiagram.module.css';

// ledger: random-feature floor r = -0.010 (E5); untrained random-init Qwen r = 0.094 (E4);
//         trained Qwen base peak r = 0.184 (E3). Trained >> untrained >> floor.
const SCALE = 0.2; // gauge full-scale, just above the trained peak
const ROWS = [
  { label: 'Trained Qwen (real model)', r: 0.184, color: '#2e8b57' },
  {
    label: 'Untrained, random-init model',
    r: 0.094,
    color: 'var(--ifm-color-primary)',
  },
  { label: 'Random-feature floor (chance)', r: -0.01, color: '#9aa0a6' },
];

export default function ControlLadderDiagram(): React.ReactElement {
  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>
        How well each model predicts brain responses (held-out r)
      </div>
      {ROWS.map((row) => {
        const widthPct = Math.max(0, Math.min(row.r / SCALE, 1)) * 100;
        return (
          <div key={row.label} className={styles.row}>
            <div className={styles.rowLabel}>{row.label}</div>
            <div className={styles.track}>
              <div
                className={styles.fill}
                style={{ width: `${widthPct}%`, background: row.color }}
              />
              <span className={styles.rowNum}>
                {row.r >= 0 ? '' : '−'}
                {Math.abs(row.r).toFixed(3)}
              </span>
            </div>
          </div>
        );
      })}
      <p className={styles.note}>
        A real trained model predicts brain responses about twice as well as the
        same architecture with random weights, and the random-feature floor sits
        at chance. The method clearly measures something real, which is what
        makes the base-versus-instruct result a genuine null rather than a
        measurement failure.
      </p>
    </div>
  );
}
