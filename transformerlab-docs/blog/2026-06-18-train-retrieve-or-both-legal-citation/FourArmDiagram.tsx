import React, { useState } from 'react';
import styles from './FourArmDiagram.module.css';

/**
 * The four-arm head-to-head on Ontario tenancy law. Click an arm to see its
 * two numbers side by side: citation exact-match (higher is better) and the
 * hallucinated-citation rate (lower is better). The story the bar chart can't
 * show on its own is the hallucination column: fine-tuning only dents it,
 * while retrieval drives it to zero by construction.
 *
 * Numbers from the ontlaw evaluation (27-item real eval, single run):
 *   base       exact 0.00  · halluc 0.81
 *   SFT-only   exact 0.148 · halluc ~0.15
 *   RAG-only   exact 0.44  · halluc 0.00
 *   hybrid     exact 0.481 · halluc 0.00
 */

interface Arm {
  key: string;
  name: string;
  config: string;
  exact: number;
  halluc: number;
  hallucDisplay: string;
  story: string;
}

const ARMS: Arm[] = [
  {
    key: 'base',
    name: 'Base zero-shot',
    config: 'Qwen2.5-7B-Instruct, no changes',
    exact: 0.0,
    halluc: 0.81,
    hallucDisplay: '81%',
    story:
      'Fluent answer, fabricated source: 0.00 exact-match and 81% of citations point to provisions that do not exist in the statute.',
  },
  {
    key: 'sft',
    name: 'SFT-only',
    config: 'LoRA on question→citation pairs',
    exact: 0.148,
    halluc: 0.15,
    hallucDisplay: '~15%',
    story:
      'Fine-tuning teaches the citation format and cuts obvious hallucinations, but it mis-recalls the exact section. You cannot memorize your way to correct statutory citations at 7B scale.',
  },
  {
    key: 'rag',
    name: 'RAG-only',
    config: 'BM25 + bge-small, k=5, cite-from-context',
    exact: 0.44,
    halluc: 0.0,
    hallucDisplay: '0%',
    story:
      'Retrieval is the decisive lever. And because the model can only cite from a pinned, verified inventory, the hallucination rate is 0.00 — a design property, not a learned one.',
  },
  {
    key: 'hybrid',
    name: 'SFT + RAG',
    config: 'fine-tuned model selecting from k=10 candidates',
    exact: 0.481,
    halluc: 0.0,
    hallucDisplay: '0%',
    story:
      'The highest-scoring arm at 0.481. We read fine-tuning as making provision selection more robust to a larger candidate set, but at n=27 the ~1-item margin over RAG-only is within noise.',
  },
];

const TARGET = 0.7;

export default function FourArmDiagram(): React.ReactElement {
  const [active, setActive] = useState(0);
  const arm = ARMS[active];
  const ok = '#2e8b57';
  const bad = '#d9534f';

  return (
    <div className={styles.wrapper}>
      <span className={styles.title}>
        Four arms, two metrics: getting the cite right vs.&nbsp;not inventing
        one
      </span>

      <div className={styles.tabs}>
        {ARMS.map((a, i) => (
          <button
            key={a.key}
            className={`${styles.tab} ${i === active ? styles.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className={styles.config}>{arm.config}</div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricHead}>
            <span className={styles.metricLabel}>citation exact-match</span>
            <span
              className={styles.metricValue}
              style={{ color: arm.exact >= TARGET ? ok : bad }}
            >
              {arm.exact.toFixed(arm.exact === 0 ? 2 : 3)}
            </span>
          </div>
          <div className={styles.track}>
            <div
              className={styles.targetTick}
              style={{ left: `${TARGET * 100}%` }}
            />
            <div
              className={styles.fill}
              style={{ width: `${arm.exact * 100}%`, background: '#4c6ef5' }}
            />
          </div>
          <span className={styles.scale}>
            0.70 target ▲ (best arm still falls short)
          </span>
        </div>

        <div className={styles.metric}>
          <div className={styles.metricHead}>
            <span className={styles.metricLabel}>
              hallucinated-citation rate
            </span>
            <span
              className={styles.metricValue}
              style={{ color: arm.halluc <= 0.05 ? ok : bad }}
            >
              {arm.hallucDisplay}
            </span>
          </div>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{ width: `${arm.halluc * 100}%`, background: bad }}
            />
          </div>
          <span className={styles.scale}>
            lower is better · retrieval arms are 0% by construction
          </span>
        </div>
      </div>

      <p className={styles.note}>{arm.story}</p>
    </div>
  );
}
