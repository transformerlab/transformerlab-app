import React, { useState } from 'react';
import styles from './ClipToggleDiagram.module.css';

// ledger: clipping ON (DAPO) recovery 0.205 = E8; clipping OFF recovery 0.000 = E11;
//         clip-off mean expression size 2.08 = E12; clip-on (lambda=0) mean size 7.7 = E6.
//         Clip *degree* (eps_high) flat = E9/E10.
const MAX_REC = 0.31; // best-seed recovery, used only as the gauge's full-scale (E17)

export default function ClipToggleDiagram(): React.ReactElement {
  const [clipOn, setClipOn] = useState(true);
  const recovery = clipOn ? 0.205 : 0.0;
  const recPct = (recovery / MAX_REC) * 100;
  const good = clipOn;

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setClipOn((v) => !v)}
        aria-pressed={clipOn}
      >
        {clipOn
          ? 'Clipping ON — stable training'
          : 'Clipping OFF — training collapsed'}
      </button>

      <div className={styles.metric}>
        <div className={styles.metricLabel}>Fraction of laws recovered</div>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{
              width: `${recPct}%`,
              background: good ? '#2e8b57' : '#d9534f',
            }}
          />
          <span className={styles.fillNum}>{recovery.toFixed(3)}</span>
        </div>
      </div>

      <div className={styles.metric}>
        <div className={styles.metricLabel}>
          Typical equation the policy settles on
        </div>
        <div
          className={styles.shape}
          style={{ color: good ? '#2e8b57' : '#d9534f' }}
        >
          {clipOn
            ? 'multi-term laws (≈7.7 parts on average)'
            : 'a constant or one variable (≈2 parts)'}
        </div>
      </div>

      <p className={styles.note}>
        {clipOn
          ? 'With clipping on, the policy trains stably and recovers about 1 in 5 laws.'
          : 'Remove clipping entirely and training breaks down: the policy collapses to trivial expressions and recovers nothing.'}{' '}
        The <em>amount</em> of clipping barely matters: widening the clip knob
        over its whole range left recovery flat. Some clipping is needed to keep
        training stable, but turning that one dial does not steer the search.
      </p>
    </div>
  );
}
