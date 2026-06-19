import React, { useState } from 'react';
import styles from './ParityWallDiagram.module.css';

/**
 * The specialization result. Toggle between:
 *  - "all methods": every flow-transformer method (SFT/DPO/ORPO) sits at a
 *    0.00 evaluation-judge win-rate; only conditioner-repair moves, and only
 *    to parity (0.50). The 0.65 target is the dashed wall nobody clears.
 *  - "severity sweep": conditioner-repair rises monotonically with
 *    degradation severity (0.125 -> 0.25 -> 0.50), saturating at parity.
 *
 * All numbers from the gen3D-FT evaluation (held-out, n=8 disjoint objects,
 * cross-family evaluation judge InternVL3-8B).
 */

type View = 'methods' | 'severity';

interface Bar {
  label: string;
  sub: string;
  win: number;
  diverged?: boolean;
}

const METHODS: Bar[] = [
  { label: 'SFT-on-best', sub: 'flow DiT · clean', win: 0.0 },
  { label: 'DPO β=0.1', sub: 'flow DiT · clean', win: 0.0 },
  { label: 'DPO β=0.5', sub: 'flow DiT · diverged', win: 0.0, diverged: true },
  { label: 'ORPO', sub: 'flow DiT · clean', win: 0.0 },
  { label: 'SFT-on-clean', sub: 'flow DiT · hard', win: 0.0 },
  { label: 'Conditioner-repair', sub: 'DINOv2 · hard (severe)', win: 0.5 },
];

const SEVERITY: Bar[] = [
  { label: 'Mild', sub: 'conditioner-repair', win: 0.125 },
  { label: 'Medium', sub: 'conditioner-repair', win: 0.25 },
  { label: 'Severe', sub: 'conditioner-repair', win: 0.5 },
];

const TARGET = 0.65;
const PARITY = 0.5;

export default function ParityWallDiagram(): React.ReactElement {
  const [view, setView] = useState<View>('methods');
  const bars = view === 'methods' ? METHODS : SEVERITY;
  const ok = '#2e8b57';
  const mid = '#e8590c';
  const flat = 'var(--ifm-color-emphasis-400)';

  const colorFor = (w: number) => (w >= TARGET ? ok : w >= PARITY ? mid : flat);

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>
          Evaluation-judge win-rate vs.&nbsp;the base
        </span>
        <div className={styles.toggle}>
          {(['methods', 'severity'] as View[]).map((v) => (
            <button
              key={v}
              className={`${styles.tab} ${view === v ? styles.tabActive : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'methods' ? 'all methods' : 'severity sweep'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chart}>
        <div className={styles.line} style={{ bottom: `${TARGET * 100}%` }}>
          <span className={styles.lineLabel}>0.65 target</span>
        </div>
        <div className={styles.lineSoft} style={{ bottom: `${PARITY * 100}%` }}>
          <span className={styles.lineLabelSoft}>0.50 parity</span>
        </div>
        {bars.map((b, i) => (
          <div key={i} className={styles.barcol}>
            <div className={styles.barArea}>
              <span className={styles.barval}>
                {b.win.toFixed(b.win === 0 ? 2 : 3)}
                {b.diverged ? '*' : ''}
              </span>
              <div
                className={styles.bar}
                style={{
                  height: `${Math.max(b.win, 0.012) * 100}%`,
                  background: colorFor(b.win),
                }}
              />
            </div>
            <span className={styles.barlabel}>{b.label}</span>
            <span className={styles.barsub}>{b.sub}</span>
          </div>
        ))}
      </div>

      <p className={styles.note}>
        {view === 'methods' ? (
          <>
            Every flow-transformer method lands at a genuine 0.00 win-rate (the
            judge is calibrated, so these are true nulls). Only
            conditioner-repair moves the output, and only to parity. No method
            clears the 0.65 bar.{' '}
            <em>
              *DPO β=0.5&rsquo;s apparent result is a divergence artifact
              (FM-MSE 0.09&rarr;4.9, geometry &minus;0.44), not a win.
            </em>
          </>
        ) : (
          <>
            Repairing the DINOv2 conditioning features rises monotonically with
            degradation severity (0.125 &rarr; 0.25 &rarr; 0.50): more
            corruption means more for a feature-repair adapter to recover. The
            effect saturates at parity: lightweight repair recovers enough to
            match the base, not to beat it.
          </>
        )}
      </p>
    </div>
  );
}
