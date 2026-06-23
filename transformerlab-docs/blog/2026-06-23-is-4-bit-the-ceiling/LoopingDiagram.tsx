import React, { useState } from 'react';
import styles from './LoopingDiagram.module.css';

// ledger: 30 SWE-Bench tasks; 6 resolved overall = 20% = B14.
//         10 produced a non-empty patch, 6 of them resolved = 60% conditional = B15.
//         20 produced no patch (looped past the 9000-token cap) = B16; 4 patched-but-wrong = derived (10 - 6).

const TOTAL = 30;        // B14
const RESOLVED = 6;      // B14
const FINISHED = 10;     // B15 (non-empty patch)
const NO_PATCH = 20;     // B16 (looped, empty)
const WRONG = FINISHED - RESOLVED; // 4

export default function LoopingDiagram(): React.ReactElement {
  const [finishedOnly, setFinishedOnly] = useState(false);

  const denom = finishedOnly ? FINISHED : TOTAL;
  const rate = Math.round((RESOLVED / denom) * 100);

  return (
    <div className={styles.wrapper}>
      <button className={styles.button} onClick={() => setFinishedOnly(v => !v)}>
        {finishedOnly
          ? 'Counting only the 10 tasks it finished'
          : 'Counting all 30 tasks'}
      </button>

      <div className={styles.gaugeLabel}>
        Bugs fixed: {RESOLVED} / {denom} = <strong>{rate}%</strong>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${rate}%` }} />
      </div>

      <p className={styles.note}>
        {finishedOnly
          ? 'When the model finishes its answer and hands back a patch, its editing skill is intact.'
          : 'On 20 of 30 tasks the model looped past its 9000-token limit and produced no patch at all. Those misses are missing answers, not wrong ones.'}
      </p>

      <div className={styles.breakdownLabel}>Where the 30 attempts go:</div>
      <div className={styles.stack}>
        <div className={`${styles.seg} ${styles.fixed}`} style={{ width: `${(RESOLVED / TOTAL) * 100}%` }}>
          {RESOLVED} fixed
        </div>
        <div className={`${styles.seg} ${styles.wrong}`} style={{ width: `${(WRONG / TOTAL) * 100}%` }}>
          {WRONG} wrong
        </div>
        <div className={`${styles.seg} ${styles.looped}`} style={{ width: `${(NO_PATCH / TOTAL) * 100}%` }}>
          {NO_PATCH} looped, no patch
        </div>
      </div>

      <p className={styles.caption}>
        The limiter at 4-bit is non-termination: the model loops instead of writing bad
        code. Fix the stopping behavior and most of the "looped, no patch" block becomes
        attempts that at least finish.
      </p>
    </div>
  );
}
