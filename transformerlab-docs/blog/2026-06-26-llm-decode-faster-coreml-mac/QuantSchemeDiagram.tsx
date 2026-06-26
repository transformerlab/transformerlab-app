import React, { useState } from 'react';
import styles from './QuantSchemeDiagram.module.css';

// ledger: GPU decode tok/s by scheme: fp16 23.8 = E12, int4-linear 75.8 = E20,
//         int8-linear 46.0 = E22, palettize-4bit 10.8 = E24, palettize-3bit 25.1 = E26.
//         coherent flags: int4 yes = E28; int8/palettize incoherent = E29, E30; fp16 baseline coherent.

type Scheme = {
  name: string;
  tps: number;
  coherent: boolean;
  baseline?: boolean;
};

const SCHEMES: Scheme[] = [
  { name: 'fp16 (no quantization)', tps: 23.8, coherent: true, baseline: true },
  { name: 'int4 linear', tps: 75.8, coherent: true },
  { name: 'int8 linear', tps: 46.0, coherent: false },
  { name: 'palettize 4-bit', tps: 10.8, coherent: false },
  { name: 'palettize 3-bit', tps: 25.1, coherent: false },
];

const MAX = 80; // axis headroom above the 75.8 max

export default function QuantSchemeDiagram(): React.ReactElement {
  const [onlyCorrect, setOnlyCorrect] = useState(false);
  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button
          className={styles.button}
          onClick={() => setOnlyCorrect((v) => !v)}
        >
          {onlyCorrect
            ? 'Showing only models that stayed correct'
            : 'Show only models that stayed correct'}
        </button>
      </div>
      <div className={styles.chart}>
        {SCHEMES.map((s) => {
          const dimmed = onlyCorrect && !s.coherent;
          const isWinner = s.name === 'int4 linear';
          return (
            <div key={s.name} className={styles.row}>
              <div className={styles.label}>{s.name}</div>
              <div className={styles.track}>
                <div
                  className={`${styles.fill} ${dimmed ? styles.dim : ''} ${isWinner ? styles.winner : ''}`}
                  style={{ width: `${(s.tps / MAX) * 100}%` }}
                />
                <span className={styles.value}>
                  {s.tps.toFixed(1)} tok/s{!s.coherent ? ' · incoherent' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.baseline}>
        Dashed marker: the fp16 baseline at 23.8 tok/s.
      </div>
      <p className={styles.caption}>
        Decode speed on the GPU for each scheme. int4 linear quantization is the
        only one that is both faster than the baseline and still produces
        correct text. The int8 and palettization cells are faster on paper but
        came out incoherent as configured, so speed alone is misleading; press
        the button to keep only the models that stayed correct.
      </p>
    </div>
  );
}
