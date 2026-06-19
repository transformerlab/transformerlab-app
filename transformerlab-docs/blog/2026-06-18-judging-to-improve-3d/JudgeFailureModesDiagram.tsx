import React, { useState } from 'react';
import styles from './JudgeFailureModesDiagram.module.css';

/**
 * The three failure modes that only surface once a VLM judge is pushed
 * inside an optimization loop (ranking never triggered them). Click a card
 * to see the symptom and the fix. Numbers from the gen3D-FT study.
 */

interface Mode {
  key: string;
  trap: string;
  symptom: string;
  fix: string;
  metric: string;
}

const MODES: Mode[] = [
  {
    key: 'overload',
    trap: 'Image overload',
    symptom:
      'Showing a reference plus a seven-image multi-view panel overwhelmed Qwen2.5-VL, which then answered purely by presentation order.',
    fix: 'Collapse to a two-image single comparison: one rendered candidate against the other.',
    metric: '100% order flips → resolved',
  },
  {
    key: 'splat',
    trap: 'Splat renders hide geometry',
    symptom:
      'Gaussian-splat renders make a sparse or broken mesh look clean, so the judge split near 50/50 even on pairs with an obvious defect.',
    fix: 'Render mesh normal-map views as a four-view 2×2 montage; holes and missing parts become unmistakable.',
    metric: '~0.5 (blind) → judge separates them',
  },
  {
    key: 'reffree',
    trap: 'Reference-free clean-but-wrong',
    symptom:
      'Asked which mesh is "better" with no reference, the judge can reward a clean but incorrect output.',
    fix: 'Montage coverage plus clear-gap calibration, so the judge is trusted only where it tracks real quality.',
    metric: 'trusted only in the calibrated regime',
  },
];

export default function JudgeFailureModesDiagram(): React.ReactElement {
  const [active, setActive] = useState(0);
  const m = MODES[active];

  return (
    <div className={styles.wrapper}>
      <span className={styles.title}>
        Three traps that only appear inside the optimization loop
      </span>

      <div className={styles.tabs}>
        {MODES.map((mode, i) => (
          <button
            key={mode.key}
            className={`${styles.tab} ${i === active ? styles.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            <span className={styles.tabNum}>{i + 1}</span>
            {mode.trap}
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        <div className={styles.row}>
          <span className={styles.rowLabelBad}>Symptom</span>
          <p className={styles.rowText}>{m.symptom}</p>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabelOk}>Fix</span>
          <p className={styles.rowText}>{m.fix}</p>
        </div>
        <div className={styles.metric}>{m.metric}</div>
      </div>
    </div>
  );
}
