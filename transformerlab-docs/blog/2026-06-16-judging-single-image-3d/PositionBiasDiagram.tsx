import React, { useState } from 'react';
import styles from './PositionBiasDiagram.module.css';

/**
 * Interactive illustration of the swap-and-keep-consistent position-bias
 * correction. Each pair is judged by judge X in BOTH presentation orders
 * (A,B) and (B,A). If the two verdicts disagree, the verdict is order-
 * dependent (position-biased) and we discard it. Agreement is measured
 * against the independent judge Y.
 *
 * Toggle the correction on/off and watch the agreement-with-Y move. The
 * twelve pairs below are a deliberately small, illustrative set chosen so
 * the corrected number lands on the paper's headline agreement (0.83) and
 * the uncorrected number sits at chance (0.50); the real study saw ~26% of
 * raw verdicts flip with order.
 */

type Pick = 'A' | 'B';
interface Pair {
  ab: Pick; // judge X's pick when shown order (A, B)
  ba: Pick; // judge X's pick when shown order (B, A)
  y: Pick; // independent judge Y's pick
}

// 6 order-consistent pairs (5 agree with Y) + 6 order-flipping pairs (1 of
// whose first-order verdicts happens to agree with Y) -> uncorrected 6/12,
// corrected 5/6.
const PAIRS: Pair[] = [
  { ab: 'A', ba: 'A', y: 'A' },
  { ab: 'B', ba: 'B', y: 'B' },
  { ab: 'A', ba: 'A', y: 'A' },
  { ab: 'B', ba: 'B', y: 'B' },
  { ab: 'A', ba: 'A', y: 'A' },
  { ab: 'B', ba: 'B', y: 'A' }, // consistent but disagrees with Y
  { ab: 'A', ba: 'B', y: 'B' }, // flips
  { ab: 'B', ba: 'A', y: 'A' }, // flips
  { ab: 'A', ba: 'B', y: 'B' }, // flips
  { ab: 'B', ba: 'A', y: 'A' }, // flips
  { ab: 'A', ba: 'B', y: 'B' }, // flips
  { ab: 'B', ba: 'A', y: 'B' }, // flips, first-order agrees with Y by luck
];

const isStable = (p: Pair) => p.ab === p.ba;

function agreement(corrected: boolean): { value: number; n: number } {
  const counted = corrected ? PAIRS.filter(isStable) : PAIRS;
  const matches = counted.filter((p) => p.ab === p.y).length;
  return { value: matches / counted.length, n: counted.length };
}

export default function PositionBiasDiagram(): React.ReactElement {
  const [corrected, setCorrected] = useState(false);
  const ok = '#2e8b57';
  const bad = '#d9534f';

  const raw = agreement(false);
  const fixed = agreement(true);
  const shown = corrected ? fixed : raw;

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>
          Judge X, queried in both orders &rarr; agreement with judge Y
        </span>
        <div className={styles.scoreboard}>
          <div className={styles.score}>
            <span className={styles.scoreLabel}>kept pairs</span>
            <span className={styles.scoreValue}>
              {shown.n}/{PAIRS.length}
            </span>
          </div>
          <div className={styles.score}>
            <span className={styles.scoreLabel}>agreement</span>
            <span
              className={styles.scoreValue}
              style={{ color: shown.value >= 0.7 ? ok : bad }}
            >
              {shown.value.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        {PAIRS.map((p, i) => {
          const stable = isStable(p);
          const dropped = corrected && !stable;
          const keptVerdict = stable ? p.ab : null;
          const matchesY = keptVerdict !== null && keptVerdict === p.y;
          return (
            <div
              key={i}
              className={`${styles.pair} ${
                dropped ? styles.pairDropped : styles.pairKept
              }`}
            >
              <div className={styles.orders}>
                <span className={styles.order}>(A,B)&rarr;{p.ab}</span>
                <span className={styles.order}>(B,A)&rarr;{p.ba}</span>
              </div>
              <div className={styles.verdictRow}>
                <span className={stable ? styles.stable : styles.flip}>
                  {stable ? 'consistent' : 'order-flip'}
                </span>
                <span className={dropped ? styles.struck : ''}>
                  {corrected && !stable
                    ? 'discarded'
                    : `vs Y: ${matchesY || (!corrected && p.ab === p.y) ? '✓' : '✗'}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.button} ${corrected ? styles.buttonActive : ''}`}
          onClick={() => setCorrected((c) => !c)}
        >
          {corrected
            ? 'Correction ON: keeping order-consistent verdicts'
            : 'Correction OFF: trusting raw verdicts'}
        </button>
        <span className={styles.caption}>
          Without the swap check, judge X&rsquo;s raw verdicts agree with the
          independent judge Y only at chance. Discard the order-dependent ones
          and the agreement jumps, which is the difference between a
          position-biased judge and a usable one.
        </span>
      </div>
    </div>
  );
}
