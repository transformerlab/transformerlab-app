import React, { useState } from 'react';
import styles from './TemplateToggleDiagram.module.css';

// ledger: raw-text Qwen base->Instruct brain-alignment change = -0.0003, p=0.92 (E6, the null).
//         chat-template change (templated - raw) for Qwen-Instruct = +0.0190, p=0.020 (E10).
//         template effect present even on the base model = +0.0125, p=0.064 (E14).
const SCALE = 0.02; // gauge full-scale, just above the largest delta shown

export default function TemplateToggleDiagram(): React.ReactElement {
  const [templated, setTemplated] = useState(false);
  const delta = templated ? 0.019 : -0.0003;
  const pValue = templated ? '0.020' : '0.92';
  const reliable = templated;
  // clamp the visual width to [0, SCALE]; a near-zero / negative delta reads as empty
  const widthPct = Math.max(0, Math.min(delta / SCALE, 1)) * 100;

  return (
    <div className={styles.wrapper}>
      <button
        className={styles.button}
        onClick={() => setTemplated((v) => !v)}
        aria-pressed={templated}
      >
        {templated ? 'Feeding chat-template text' : 'Feeding plain raw text'}
      </button>

      <div className={styles.metricLabel}>
        Change in brain-alignment, base model &rarr; instruction-tuned model
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{
            width: `${widthPct}%`,
            background: reliable ? '#2e8b57' : '#9aa0a6',
          }}
        />
        <span className={styles.fillNum}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(4)}
        </span>
      </div>

      <div
        className={styles.verdict}
        style={{ color: reliable ? '#2e8b57' : '#d9534f' }}
      >
        {reliable
          ? `reliable change (p = ${pValue})`
          : `no reliable change (p = ${pValue})`}
      </div>

      <p className={styles.note}>
        {templated
          ? 'Wrap the same sentences in the chat template the instruct model expects, and alignment rises by a reliable +0.019. A similar shift shows up even in the untuned base model (+0.0125, only marginal at p = 0.064), so this is about the input format, not about instruction tuning.'
          : 'Feed the model plain sentences and instruction tuning moves brain-alignment by −0.0003: indistinguishable from zero. The weights, on their own, do not become more brain-like.'}
      </p>
    </div>
  );
}
