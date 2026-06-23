import React, { useState } from 'react';
import styles from './CandidateDepthDiagram.module.css';

/**
 * A suggestive interaction between fine-tuning and retrieval depth k. More
 * retrieved candidates HURT the zero-shot RAG model (0.44 at k=5 -> 0.37 at
 * k=10) but HELP the fine-tuned hybrid (0.333 at k=5 -> 0.481 at k=10). The
 * reading: fine-tuning teaches more robust selection from a noisier,
 * higher-recall candidate set. Offered as a hypothesis, not a proven effect
 * (deltas are 1-4 items on n=27, and recall also rises with k).
 *
 * Drag the toggle between k=5 and k=10 and watch the two lines cross.
 */

type K = 5 | 10;

const EXACT: Record<K, { rag: number; hybrid: number; recall: number }> = {
  5: { rag: 0.44, hybrid: 0.333, recall: 0.815 },
  10: { rag: 0.37, hybrid: 0.481, recall: 0.889 },
};

export default function CandidateDepthDiagram(): React.ReactElement {
  const [k, setK] = useState<K>(5);
  const d = EXACT[k];
  const ragC = '#4c6ef5';
  const hybridC = '#2e8b57';

  const Bar = ({
    name,
    v,
    color,
  }: {
    name: string;
    v: number;
    color: string;
  }) => (
    <div className={styles.barcol}>
      <span className={styles.barval} style={{ color }}>
        {v.toFixed(3)}
      </span>
      <div className={styles.barArea}>
        <div
          className={styles.bar}
          style={{ height: `${v * 140}%`, background: color }}
        />
      </div>
      <span className={styles.barlabel}>{name}</span>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>
          Retrieval depth <em>k</em> helps the fine-tuned arm, hurts the
          zero-shot one
        </span>
        <div className={styles.toggle}>
          {([5, 10] as K[]).map((kk) => (
            <button
              key={kk}
              className={`${styles.tab} ${k === kk ? styles.tabActive : ''}`}
              onClick={() => setK(kk)}
            >
              k = {kk}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chart}>
        <Bar name="RAG-only" v={d.rag} color={ragC} />
        <Bar name="SFT + RAG hybrid" v={d.hybrid} color={hybridC} />
      </div>

      <div className={styles.meta}>
        <span>
          recall@{k} = <strong>{d.recall.toFixed(3)}</strong>
        </span>
        <span>
          {k === 5
            ? 'At k=5, plain RAG leads and the hybrid trails.'
            : 'At k=10, they swap: more candidates raise recall but only the fine-tuned arm turns the extra recall into exact matches.'}
        </span>
      </div>

      <p className={styles.note}>
        Offered as a hypothesis, not an established effect: the deltas are one
        to four items on n=27, the comparison is confounded because recall also
        rises with <em>k</em>, and we did not measure the selection term
        directly.
      </p>
    </div>
  );
}
