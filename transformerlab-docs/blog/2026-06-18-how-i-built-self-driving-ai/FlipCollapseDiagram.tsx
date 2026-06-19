import React, { useState } from 'react';
import styles from './FlipCollapseDiagram.module.css';

/**
 * The augmentation that backfires. Horizontal flip (mirror the image, negate
 * the angle) is label-correct, but on a ~95%-near-zero steering target it
 * symmetrizes the distribution around 0 and reinforces the predict-zero
 * solution. With flip ON the model collapses to a constant: predicted-angle
 * dispersion pred_sd -> 0 and turn-slice correlation -> 0, despite a
 * plausible training loss. Toggle it and watch both diagnostics move.
 *
 * iota numbers: PilotNet turn-slice correlation 0 -> 0.87 when the flip is
 * removed (together with the cost-sensitive loss); strong models sit at
 * pred_sd ~2.6-3.5 against a true signal of ~5 degrees, collapsed runs ~0.
 */

export default function FlipCollapseDiagram(): React.ReactElement {
  const [flip, setFlip] = useState(true);
  const ok = '#2e8b57';
  const bad = '#d9534f';

  const corr = flip ? 0.0 : 0.87;
  const predSd = flip ? 0.1 : 3.0; // collapsed ~0 vs healthy ~2.6-3.5
  const trueSd = 5.0;

  const Gauge = ({
    label,
    value,
    max,
    display,
    good,
  }: {
    label: string;
    value: number;
    max: number;
    display: string;
    good: boolean;
  }) => (
    <div className={styles.gauge}>
      <div className={styles.gaugeHead}>
        <span className={styles.gaugeLabel}>{label}</span>
        <span className={styles.gaugeValue} style={{ color: good ? ok : bad }}>
          {display}
        </span>
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{
            width: `${Math.min(100, (value / max) * 100)}%`,
            background: good ? ok : bad,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>Horizontal-flip augmentation</span>
        <button
          className={`${styles.button} ${flip ? styles.buttonBad : styles.buttonOk}`}
          onClick={() => setFlip((f) => !f)}
        >
          {flip ? 'Flip ON — model collapsed' : 'Flip OFF — model recovered'}
        </button>
      </div>

      <Gauge
        label="turn-slice correlation"
        value={corr}
        max={1}
        display={corr.toFixed(2)}
        good={!flip}
      />
      <Gauge
        label={`predicted-angle dispersion (pred_sd, true signal ≈ ${trueSd}°)`}
        value={predSd}
        max={trueSd}
        display={flip ? '≈ 0' : '≈ 3.0'}
        good={!flip}
      />

      <p className={styles.note}>
        {flip
          ? 'With the flip on, the model predicts a near-constant angle: pred_sd collapses toward 0 and correlation is ~0, even though the training loss looks fine. Aggregate error would have hidden this — the dispersion diagnostic is what caught it.'
          : 'Drop the flip (with the cost-sensitive loss) and a genuine model comes back: PilotNet turn-slice correlation moves from 0 to 0.87 and predictions regain a sensible spread.'}
      </p>
    </div>
  );
}
