import React, { useState } from 'react';
import styles from './ParityScalingDiagram.module.css';

/**
 * Conv-vs-transformer parity across data sizes. A grouped bar chart of
 * Pearson correlation for the pretrained ResNet-50 and the low-LR
 * full-fine-tuned ViT-S/DINO at 5.2k and 16k frames. Toggle between the
 * turn slice (the load-bearing metric) and overall correlation.
 *
 * Held-out, group-by-route, mean over 3 seeds (iota Table 1):
 *   turns: ResNet 0.954 / 0.967 ; ViT 0.965 / 0.964
 *   all:   ResNet 0.756 / 0.821 ; ViT 0.789 / 0.815
 */

type Metric = 'turns' | 'all';
interface Cell {
  size: string;
  resnet: number;
  vit: number;
}

const DATA: Record<Metric, Cell[]> = {
  turns: [
    { size: '5.2k', resnet: 0.954, vit: 0.965 },
    { size: '16k', resnet: 0.967, vit: 0.964 },
  ],
  all: [
    { size: '5.2k', resnet: 0.756, vit: 0.789 },
    { size: '16k', resnet: 0.821, vit: 0.815 },
  ],
};

const RESNET_C = '#4c6ef5';
const VIT_C = '#e8590c';

export default function ParityScalingDiagram(): React.ReactElement {
  const [metric, setMetric] = useState<Metric>('turns');
  const cells = DATA[metric];

  return (
    <div className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.title}>
          Pearson correlation vs.&nbsp;data size
        </span>
        <div className={styles.toggle}>
          {(['turns', 'all'] as Metric[]).map((m) => (
            <button
              key={m}
              className={`${styles.tab} ${metric === m ? styles.tabActive : ''}`}
              onClick={() => setMetric(m)}
            >
              {m === 'turns' ? 'turn slice' : 'overall'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chart}>
        {cells.map((c) => (
          <div key={c.size} className={styles.group}>
            <div className={styles.bars}>
              {[
                { name: 'ResNet-50', v: c.resnet, color: RESNET_C },
                { name: 'ViT-S/DINO', v: c.vit, color: VIT_C },
              ].map((b) => (
                <div key={b.name} className={styles.barcol}>
                  <span className={styles.barval}>{b.v.toFixed(3)}</span>
                  <div
                    className={styles.bar}
                    style={{ height: `${b.v * 100}%`, background: b.color }}
                  />
                </div>
              ))}
            </div>
            <span className={styles.xlabel}>{c.size} frames</span>
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: RESNET_C }} />
          ResNet-50 (conv, pretrained)
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: VIT_C }} />
          ViT-S/DINO (transformer, full ft)
        </span>
      </div>

      <p className={styles.note}>
        {metric === 'turns'
          ? 'On the turn slice the two backbones are on top of each other and already near-ceiling (~0.96) at 5.2k frames — the ViT does not need more data to "catch up."'
          : 'Overall correlation is comparable and both improve with data (~0.76 → 0.82 from 5.2k to 16k). The y-axis is correlation (0–1); bars are not zero-based-truncated.'}
      </p>
    </div>
  );
}
