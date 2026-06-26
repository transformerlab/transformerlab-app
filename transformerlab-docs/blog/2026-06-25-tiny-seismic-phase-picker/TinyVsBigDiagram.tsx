import React, { useState } from 'react';
import styles from './TinyVsBigDiagram.module.css';

// ledger: ours 33,610 params (B1), test score 0.76 (B2).
//         PhaseNet 268,443 params (B5), test score 0.64 (B4). ratio ~8x (B6).

const MODELS = [
  { name: 'Our small model', params: 33610, score: 0.76, ours: true },
  { name: 'PhaseNet (standard)', params: 268443, score: 0.64, ours: false },
];
const MAX_PARAMS = 268443;

export default function TinyVsBigDiagram(): React.ReactElement {
  const [view, setView] = useState<'size' | 'score'>('size');

  return (
    <div className={styles.wrapper}>
      <div className={styles.toggle}>
        <button
          className={view === 'size' ? styles.active : styles.inactive}
          onClick={() => setView('size')}
        >
          Size
        </button>
        <button
          className={view === 'score' ? styles.active : styles.inactive}
          onClick={() => setView('score')}
        >
          Score
        </button>
      </div>

      {MODELS.map((m) => {
        const frac = view === 'size' ? m.params / MAX_PARAMS : m.score;
        const label =
          view === 'size'
            ? `${m.params.toLocaleString()} parameters`
            : `${m.score.toFixed(2)} out of 1.00`;
        return (
          <div key={m.name} className={styles.row}>
            <div className={styles.name}>{m.name}</div>
            <div className={styles.track}>
              <div
                className={`${styles.fill} ${m.ours ? styles.ours : styles.other}`}
                style={{ width: `${frac * 100}%` }}
              >
                <span className={styles.val}>{label}</span>
              </div>
            </div>
          </div>
        );
      })}

      <p className={styles.caption}>
        {view === 'size'
          ? 'Size: our model is about 8 times smaller. Now press Score.'
          : 'Score on the same fair test: the smaller model is a little more accurate.'}
      </p>
    </div>
  );
}
