import React, { useState } from 'react';
import styles from './BitWidthDiagram.module.css';

// ledger: mixed_3_4 ~3.5b -> pass@1 0.8598, peak 14.81GB = B18 (+ paper E10 memory).
//         RTN 4-bit 4.0b -> 0.8902, 19.33GB = B2/B5; win-margin band +/-1.5pts = B7.
//         streaming-GPTQ 4.0b -> 0.8841 = B11; eval peak 19.33GB (shares RTN alloc) = B24.
//         mixed_4_8 ~5.2b -> 0.9024, 20.53GB = B8; tie vs 4-bit p=0.79 = B9; p=1.000 = B11.
//         24 GB memory budget = B22. SCORE_MIN/MAX (0.80/0.92) = presentation axis bounds only.

type Config = {
  key: string;
  label: string;
  bits: string;
  score: number;   // full HumanEval-164 pass@1
  mem: number;     // peak RAM (GB), short-context
  verdict: string;
  good: boolean;   // meets-or-ties the 4-bit ceiling
};

const RTN_SCORE = 0.8902;     // the reference (B2)
const NOISE = 0.015;          // +/- win margin / test noise (B7)
const SCORE_MIN = 0.8;
const SCORE_MAX = 0.92;
const MEM_CAP = 24;           // GB budget (B22)

const CONFIGS: Config[] = [
  { key: 'm34', label: '3.5-bit mix', bits: '~3.5 bits/weight', score: 0.8598, mem: 14.81,
    verdict: 'Below 4-bit: a real accuracy drop, even though it saves memory.', good: false },
  { key: 'rtn', label: '4-bit', bits: '4.0 bits/weight', score: 0.8902, mem: 19.33,
    verdict: 'The deliverable. Fits 24 GB with room to spare.', good: true },
  { key: 'sgptq', label: '4-bit, calibrated', bits: '4.0 bits/weight', score: 0.8841, mem: 19.33,
    verdict: 'Calibration (GPTQ) ties plain 4-bit exactly (p = 1.000). No gain.', good: true },
  { key: 'm48', label: '5.2-bit mix', bits: '~5.2 bits/weight', score: 0.9024, mem: 20.53,
    verdict: 'Ties 4-bit (p = 0.79). The +1.2-point lead is inside the noise.', good: true },
];

function pctScore(s: number): number {
  return Math.max(0, Math.min(100, ((s - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100));
}

export default function BitWidthDiagram(): React.ReactElement {
  const [sel, setSel] = useState('rtn');
  const cfg = CONFIGS.find(c => c.key === sel) as Config;

  const bandLeft = pctScore(RTN_SCORE - NOISE);
  const bandRight = pctScore(RTN_SCORE + NOISE);
  const refPos = pctScore(RTN_SCORE);

  return (
    <div className={styles.wrapper}>
      <div className={styles.buttons}>
        {CONFIGS.map(c => (
          <button
            key={c.key}
            className={`${styles.button} ${sel === c.key ? styles.active : ''}`}
            onClick={() => setSel(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.bits}>{cfg.bits}</div>

      <div className={styles.row}>
        <div className={styles.metricLabel}>Coding score (HumanEval pass@1)</div>
        <div className={styles.track}>
          <div className={styles.band} style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }} />
          <div className={styles.refLine} style={{ left: `${refPos}%` }} />
          <div
            className={`${styles.marker} ${cfg.good ? styles.markerGood : styles.markerBad}`}
            style={{ left: `${pctScore(cfg.score)}%` }}
          />
        </div>
        <div className={styles.scaleRow}>
          <span>{SCORE_MIN.toFixed(2)}</span>
          <span className={styles.bandLabel}>shaded = tie with 4-bit (within noise)</span>
          <span>{SCORE_MAX.toFixed(2)}</span>
        </div>
        <div className={styles.value}>{cfg.score.toFixed(4)} pass@1</div>
      </div>

      <div className={styles.row}>
        <div className={styles.metricLabel}>Peak memory (of the 24 GB budget)</div>
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: `${(cfg.mem / MEM_CAP) * 100}%` }}
          />
        </div>
        <div className={styles.value}>{cfg.mem.toFixed(1)} GB / 24 GB</div>
      </div>

      <p className={styles.verdict}>{cfg.verdict}</p>
      <p className={styles.caption}>
        Step across the settings. Below 4-bit the score falls out of the shaded tie band.
        Above 4-bit it stays inside the band while the memory bar climbs. 4-bit is the sweet
        spot: less costs accuracy, more costs only memory.
      </p>
    </div>
  );
}
