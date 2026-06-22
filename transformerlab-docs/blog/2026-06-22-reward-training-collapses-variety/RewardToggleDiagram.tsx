import React, { useState } from 'react';
import styles from './RewardToggleDiagram.module.css';

// ledger: gated distinct@reward~0.8 = 0.019, cell-disagreement 0.00 = E23;
//         diversity-aware distinct@reward~0.8 = 0.155, cell-disagreement 0.03 = E24;
//         un-collapsed reference cell-disagreement 0.39, distinct 1.0 = E25;
//         ~8x distinct at matched reward (0.155 vs 0.019) = E26.

const REF_DISAGREE = 0.39; // un-collapsed reference (E25)

type Stat = { distinct: number; disagree: number };
const GATED: Stat = { distinct: 0.019, disagree: 0.0 };
const DIVERSE: Stat = { distinct: 0.155, disagree: 0.03 };

function Bar({
  label,
  value,
  max,
  pct,
  cls,
}: {
  label: string;
  value: string;
  max: number;
  pct: number;
  cls: string;
}): React.ReactElement {
  return (
    <div className={styles.metric}>
      <div className={styles.metricHead}>
        <span>{label}</span>
        <span className={styles.metricVal}>{value}</span>
      </div>
      <div className={styles.track}>
        <div className={`${styles.fill} ${cls}`} style={{ width: `${pct}%` }} />
        {/* reference marker for the structural-variety track */}
        {max === REF_DISAGREE ? (
          <div
            className={styles.refMark}
            style={{ left: '100%' }}
            title="un-collapsed model"
          />
        ) : null}
      </div>
    </div>
  );
}

export default function RewardToggleDiagram(): React.ReactElement {
  const [diverse, setDiverse] = useState(false);
  const s = diverse ? DIVERSE : GATED;

  // distinct@reward~0.8 plotted against the un-collapsed ceiling of 1.0
  const distinctPct = (s.distinct / 1.0) * 100;
  // structural variety plotted against the un-collapsed reference of 0.39
  const disagreePct = (s.disagree / REF_DISAGREE) * 100;

  return (
    <div className={styles.wrapper}>
      <button
        className={
          diverse ? `${styles.toggle} ${styles.onDiverse}` : styles.toggle
        }
        onClick={() => setDiverse((v) => !v)}
      >
        {diverse
          ? 'Diversity-aware reward (pay a bit extra for new shapes)'
          : 'Standard gated reward (pay only for solvable and in-band)'}
      </button>

      <Bar
        label="Distinct valid levels at matched high reward"
        value={s.distinct.toFixed(3)}
        max={1.0}
        pct={distinctPct}
        cls={diverse ? styles.good : styles.bad}
      />
      <Bar
        label="Structural variety (cells that differ between samples)"
        value={s.disagree.toFixed(2)}
        max={REF_DISAGREE}
        pct={disagreePct}
        cls={diverse ? styles.midGood : styles.bad}
      />
      <p className={styles.refNote}>
        The thin marker at the right end of the second bar is where an
        un-collapsed model sits: 0.39.
      </p>

      <p className={styles.caption}>
        Toggle the reward. The top bar is the loose count of distinct levels;
        the bottom bar is the strict square-by-square difference, with the thin
        marker showing where an un-collapsed model sits. The bonus moves the
        loose bar a lot and the strict bar almost not at all. It breaks exact
        copying without buying back real variety, at least at this model size.
      </p>
    </div>
  );
}
