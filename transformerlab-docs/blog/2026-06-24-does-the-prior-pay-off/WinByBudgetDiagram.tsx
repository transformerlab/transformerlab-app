import React, { useEffect, useState } from 'react';
import styles from './WinByBudgetDiagram.module.css';

// ledger: top-100 mean GB1 fitness, 5 seeds, by query budget.
//   budgets:            100,   1k,    1.28k, 2k,    3k,    5k,    20k
//   RL on 150M model:   0.36,  4.77,  4.92,  5.23,  5.39,  5.50,  5.67  (E15, E17, E18)
//   annealing:          0.93,  4.34,  4.61,  5.00,  5.28,  5.53,  5.72  (E12, E17, E18)
//   gap RL vs anneal:   loses, +10%,  +7%,   +5%,   +2%,   tie,   tie   (E16)
const BUDGETS = ['100', '1k', '1.28k', '2k', '3k', '5k', '20k'];
const RL = [0.36, 4.77, 4.92, 5.23, 5.39, 5.5, 5.67];
const ANNEAL = [0.93, 4.34, 4.61, 5.0, 5.28, 5.53, 5.72];
const SCALE_MAX = 6.0;
const TICK_MS = 900;
const HOLD_TICKS = 4;

function pct(v: number): string {
  return `${Math.min(100, (v / SCALE_MAX) * 100).toFixed(1)}%`;
}

function verdict(i: number): { text: string; color: string } {
  const g = (RL[i] - ANNEAL[i]) / ANNEAL[i];
  if (g < -0.1) {
    return { text: 'RL behind (too few tries)', color: '#d9534f' };
  }
  if (g > 0.015) {
    return { text: `RL ahead by ${Math.round(g * 100)}%`, color: '#2e8b57' };
  }
  return {
    text: 'tie (both near the best possible)',
    color: 'var(--ifm-color-emphasis-700)',
  };
}

export default function WinByBudgetDiagram(): React.ReactElement {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let hold = 0;
    const id = setInterval(() => {
      setI((f) => {
        if (f >= BUDGETS.length - 1) {
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
  }, [playing]);

  const v = verdict(i);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button className={styles.button} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className={styles.button}
          onClick={() => {
            setI(0);
            setPlaying(true);
          }}
        >
          Restart
        </button>
        <span className={styles.budget}>
          Budget: <strong>{BUDGETS[i]}</strong> tries
        </span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Trial and error</span>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{
              width: pct(ANNEAL[i]),
              background: 'var(--ifm-color-primary)',
            }}
          />
        </div>
        <span className={styles.value}>{ANNEAL[i].toFixed(2)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>RL (150M model)</span>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: pct(RL[i]), background: v.color }}
          />
        </div>
        <span className={styles.value}>{RL[i].toFixed(2)}</span>
      </div>

      <p className={styles.note} style={{ color: v.color }}>
        {v.text}
      </p>
      <p className={styles.caption}>
        RL&rsquo;s lead is largest when tries are scarce (around 1,000), then
        shrinks to a tie as both methods run out of room near the best possible
        protein.
      </p>
    </div>
  );
}
