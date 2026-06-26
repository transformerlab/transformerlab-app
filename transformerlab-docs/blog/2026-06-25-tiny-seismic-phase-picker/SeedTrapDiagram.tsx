import React, { useState } from 'react';
import styles from './SeedTrapDiagram.module.css';

// ledger: lucky single run gain @1% = +0.145 (B9).
//         three repeat-run gains @1% = [+0.008, +0.078, -0.125] (B10).
//         their average = -0.01 (B11), basically zero.

const LUCKY = 0.145;
const SEEDS = [0.008, 0.078, -0.125];
const MEAN = -0.01;
const AXIS = 0.2; // top and bottom of the chart are +0.2 and -0.2

function barHeight(v: number): string {
  return `${(Math.abs(v) / AXIS) * 50}%`;
}

export default function SeedTrapDiagram(): React.ReactElement {
  const [allSeeds, setAllSeeds] = useState(false);
  const bars = allSeeds ? SEEDS : [LUCKY];
  const labels = allSeeds ? ['run 1', 'run 2', 'run 3'] : ['one run'];

  return (
    <div className={styles.wrapper}>
      <button className={styles.button} onClick={() => setAllSeeds((v) => !v)}>
        {allSeeds ? 'Showing three repeat runs' : 'Showing one lucky run'}
      </button>

      <div className={styles.plot}>
        <div className={styles.zeroLine}>
          <span className={styles.zeroLabel}>no change (0.0)</span>
        </div>

        <div className={styles.bars}>
          {bars.map((v, i) => (
            <div key={i} className={styles.barCol}>
              <div className={styles.barTop}>
                {v >= 0 && (
                  <div
                    className={`${styles.bar} ${styles.pos}`}
                    style={{ height: barHeight(v) }}
                  >
                    <span className={styles.barVal}>
                      +{v.toFixed(allSeeds ? 3 : 2)}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.barBottom}>
                {v < 0 && (
                  <div
                    className={`${styles.bar} ${styles.neg}`}
                    style={{ height: barHeight(v) }}
                  >
                    <span className={styles.barVal}>
                      {v.toFixed(allSeeds ? 3 : 2)}
                    </span>
                  </div>
                )}
              </div>
              <span className={styles.barLabel}>{labels[i]}</span>
            </div>
          ))}
        </div>

        {allSeeds && (
          <div
            className={styles.meanLine}
            style={{ top: `${50 - (MEAN / AXIS) * 50}%` }}
          >
            <span className={styles.meanLabel}>average {MEAN.toFixed(2)}</span>
          </div>
        )}
      </div>

      <p className={styles.note}>
        {allSeeds
          ? 'Repeated three times, the head start bounces around zero. The +0.15 was just luck.'
          : 'One run showed the study-first trick adding +0.15 to the score. Press the button to run it again.'}
      </p>
      <p className={styles.caption}>
        Change in score from studying unlabeled data first, with only 1 in 100
        labels. One run can look like a win that vanishes when you repeat it.
      </p>
    </div>
  );
}
