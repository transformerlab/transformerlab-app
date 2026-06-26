import React, { useState } from 'react';
import styles from './NllToggleDiagram.module.css';

// ledger: held-out TEST next-step NLL (job 6be4686e final, d63963e2 base; s6 report).
//   base overall 1.6120, tool_use 1.5298, text 2.0331
//   distilled overall 0.9254, tool_use 0.8605, text 1.2576
//   perplexity base 5.01 -> distilled 2.52 (exp of overall NLL)
const ROWS = [
  { key: 'overall', label: 'All steps', base: 1.612, distilled: 0.9254 },
  { key: 'tool', label: 'Tool calls (81%)', base: 1.5298, distilled: 0.8605 },
  {
    key: 'text',
    label: 'Free-text reasoning (19%)',
    base: 2.0331,
    distilled: 1.2576,
  },
];
const MAX = 2.2; // gauge ceiling, just above the largest value

export default function NllToggleDiagram(): React.ReactElement {
  const [distilled, setDistilled] = useState(true);
  return (
    <div className={styles.wrapper}>
      <button className={styles.button} onClick={() => setDistilled((v) => !v)}>
        {distilled
          ? 'Showing: fabledistil (distilled). Tap to see the base model.'
          : 'Showing: Qwen3-8B base. Tap to see the distilled model.'}
      </button>
      <div className={styles.grid}>
        {ROWS.map((r) => {
          const v = distilled ? r.distilled : r.base;
          return (
            <div key={r.key} className={styles.row}>
              <span className={styles.rowLabel}>{r.label}</span>
              <div className={styles.track}>
                <div
                  className={styles.fill}
                  style={{
                    width: `${(v / MAX) * 100}%`,
                    background: distilled ? '#2e8b57' : '#d9534f',
                  }}
                />
              </div>
              <span className={styles.value}>{v.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.note}>
        {distilled
          ? 'Perplexity 2.52. The distilled model predicts the teacher’s next step far better, and the gain is largest on free-text reasoning, where the base was weakest.'
          : 'Perplexity 5.01. The base model is worst at the free-text reasoning between actions (2.03), better at tool calls (1.53).'}
      </p>
      <p className={styles.caption}>
        Held-out next-step loss (negative log-likelihood, lower is better) on
        sessions the model never trained on. Distillation improves every step
        type and never regresses one.
      </p>
    </div>
  );
}
