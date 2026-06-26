import React, { useState } from 'react';
import styles from './ComputeUnitDiagram.module.css';

// ledger: fp16 decode tok/s by requested compute unit: CPU-only 20.7 = E15,
//         CPU+ANE 20.7 = E14 (matches CPU-only within IQR ~1ms = E46, i.e. CPU fallback),
//         CPU+GPU/GPU 23.8 = E12. int4-on-GPU payoff 75.8 = E20.

type Unit = { key: 'ane' | 'gpu'; label: string; tps: number; note: string };

const UNITS: Unit[] = [
  { key: 'ane', label: 'CPU only', tps: 20.7, note: 'no accelerator' },
  {
    key: 'ane',
    label: 'Neural Engine requested',
    tps: 20.7,
    note: 'same as CPU: it fell back',
  },
  { key: 'gpu', label: 'GPU', tps: 23.8, note: 'actually faster' },
];

const MAX = 26;

export default function ComputeUnitDiagram(): React.ReactElement {
  const [requested, setRequested] = useState<'ane' | 'gpu'>('ane');
  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button
          className={`${styles.button} ${requested === 'ane' ? styles.active : ''}`}
          onClick={() => setRequested('ane')}
        >
          Ask for the Neural Engine
        </button>
        <button
          className={`${styles.button} ${requested === 'gpu' ? styles.active : ''}`}
          onClick={() => setRequested('gpu')}
        >
          Ask for the GPU
        </button>
      </div>
      <div className={styles.chart}>
        {UNITS.map((u) => {
          const highlit =
            (requested === 'ane' && u.label === 'Neural Engine requested') ||
            (requested === 'gpu' && u.label === 'GPU');
          return (
            <div key={u.label} className={styles.row}>
              <div className={styles.label}>{u.label}</div>
              <div className={styles.track}>
                <div
                  className={`${styles.fill} ${highlit ? styles.hi : ''}`}
                  style={{ width: `${(u.tps / MAX) * 100}%` }}
                />
                <span className={styles.value}>
                  {u.tps.toFixed(1)} tok/s · {u.note}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.caption}>
        {requested === 'ane'
          ? 'Asking for the Neural Engine returns exactly the CPU-only speed (20.7 tok/s). That match is the sign the model never ran on the Neural Engine and fell back to the CPU.'
          : 'The GPU is the only accelerator that was actually faster for decoding (23.8 vs 20.7 tok/s). Quantizing the weights to 4 bits then pushes the GPU to 75.8 tok/s.'}
      </p>
    </div>
  );
}
