import React, { useState } from 'react';
import styles from './AdaptationLadderDiagram.module.css';

/**
 * The paper's thesis in one interactive figure: the SAME DINO-pretrained
 * ViT-S backbone reaches wildly different turn-slice quality depending only
 * on how it is adapted. Step through the three rungs and watch the
 * turn-slice correlation bar move from 0.38 (frozen probe) to conv-parity
 * (0.964) without changing the architecture at all.
 *
 * Numbers from the iota evaluation (held-out, group-by-route, 3 seeds):
 *   frozen linear probe        -> 0.38  (pretrained features only)
 *   full fine-tune, lr 1e-4    -> underfits (loss plateau)
 *   full fine-tune, lr 3e-5    -> 0.964 (matches ResNet-50's 0.967)
 */

interface Rung {
  key: string;
  label: string;
  detail: string;
  corr: number | null; // turn-slice Pearson; null = underfits
  note: string;
}

const RUNGS: Rung[] = [
  {
    key: 'probe',
    label: 'Frozen linear probe',
    detail: 'pretrained features only',
    corr: 0.38,
    note: 'The first thing a practitioner tries. Reads as "the transformer cannot capture steering" — this is what makes a ViT look data-hungry.',
  },
  {
    key: 'highlr',
    label: 'Full fine-tune, lr 1e-4',
    detail: 'learning rate too high',
    corr: null,
    note: 'Underfits: the training loss plateaus. The backbone is unfrozen, but the schedule is wrong.',
  },
  {
    key: 'lowlr',
    label: 'Full fine-tune, lr 3e-5',
    detail: 'low-LR full fine-tune',
    corr: 0.964,
    note: 'Conv-competitive: matches a pretrained ResNet-50 (0.967) within the seed-to-seed spread. Same backbone, different adaptation.',
  },
];

const RESNET = 0.967; // pretrained ResNet-50, turn-slice Pearson @16k

export default function AdaptationLadderDiagram(): React.ReactElement {
  const [active, setActive] = useState(0);
  const rung = RUNGS[active];
  const ok = '#2e8b57';
  const bad = '#d9534f';
  const pct = rung.corr === null ? 0 : rung.corr * 100;
  const reachesParity = rung.corr !== null && rung.corr >= 0.95;

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>
          One backbone (ViT-S/DINO), three adaptations
        </span>
        <div className={styles.score}>
          <span className={styles.scoreLabel}>turn-slice correlation</span>
          <span
            className={styles.scoreValue}
            style={{
              color: rung.corr === null ? bad : reachesParity ? ok : bad,
            }}
          >
            {rung.corr === null ? 'underfits' : rung.corr.toFixed(3)}
          </span>
        </div>
      </div>

      <div className={styles.bartrack}>
        <div
          className={styles.barfill}
          style={{
            width: `${pct}%`,
            background: reachesParity ? ok : bad,
          }}
        />
        <div className={styles.resnetMark} style={{ left: `${RESNET * 100}%` }}>
          <span className={styles.resnetLabel}>ResNet-50 0.967</span>
        </div>
      </div>

      <div className={styles.rungs}>
        {RUNGS.map((r, i) => (
          <button
            key={r.key}
            className={`${styles.rung} ${i === active ? styles.rungActive : ''}`}
            onClick={() => setActive(i)}
          >
            <span className={styles.rungLabel}>{r.label}</span>
            <span className={styles.rungDetail}>{r.detail}</span>
            <span
              className={styles.rungCorr}
              style={{
                color: r.corr === null ? bad : r.corr >= 0.95 ? ok : bad,
              }}
            >
              {r.corr === null ? '—' : r.corr.toFixed(2)}
            </span>
          </button>
        ))}
      </div>

      <p className={styles.note}>{rung.note}</p>
    </div>
  );
}
