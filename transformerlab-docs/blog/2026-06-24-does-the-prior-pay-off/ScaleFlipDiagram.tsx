import React, { useState } from 'react';
import styles from './ScaleFlipDiagram.module.css';

// ledger: at a 1,000-query budget, top-100 mean GB1 fitness:
//   simulated annealing = 4.34 (E12); RL on the 35M model = 4.49 (E14);
//   RL on the 150M model = 4.77 (E15). Gap RL150 vs anneal = +10% (E16).
//   Fitness scale: wild-type = 1.0, best possible = 8.76 (E2, E3).
const ANNEAL = 4.34;
const RL_35M = 4.49;
const RL_150M = 4.77;
const SCALE_MAX = 6.0; // gauge ceiling, chosen for readability (all bars < 5)

function pct(v: number): string {
  return `${Math.min(100, (v / SCALE_MAX) * 100).toFixed(1)}%`;
}

export default function ScaleFlipDiagram(): React.ReactElement {
  const [big, setBig] = useState(false);
  const rl = big ? RL_150M : RL_35M;
  const rlWins = rl - ANNEAL > 0.1 * ANNEAL; // the pre-registered 10% bar
  const gap = Math.round(((rl - ANNEAL) / ANNEAL) * 100);

  return (
    <div className={styles.wrapper}>
      <button className={styles.button} onClick={() => setBig((v) => !v)}>
        {big
          ? 'Bigger protein model (150M), click to shrink it'
          : 'Small protein model (35M), click to scale it up'}
      </button>

      <div className={styles.row}>
        <span className={styles.label}>Trial and error (annealing)</span>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{
              width: pct(ANNEAL),
              background: 'var(--ifm-color-primary)',
            }}
          />
        </div>
        <span className={styles.value}>{ANNEAL.toFixed(2)}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>RL on the protein model</span>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{
              width: pct(rl),
              background: rlWins ? '#2e8b57' : '#caa43a',
            }}
          />
        </div>
        <span className={styles.value}>{rl.toFixed(2)}</span>
      </div>

      <p className={styles.note}>
        {big ? (
          <>
            With the bigger model, RL reaches {RL_150M.toFixed(2)} versus
            annealing&rsquo;s {ANNEAL.toFixed(2)}: about{' '}
            <strong>{gap}% better</strong>, given the same number of tries. RL
            wins.
          </>
        ) : (
          <>
            With the small model, RL reaches {RL_35M.toFixed(2)} versus
            annealing&rsquo;s {ANNEAL.toFixed(2)}. That is a tie, not a win.
            Cheap trial and error keeps up.
          </>
        )}
      </p>
      <p className={styles.caption}>
        Same problem, same query budget (1,000 tries). Scaling the protein model
        is what turns a tie into a win.
      </p>
    </div>
  );
}
