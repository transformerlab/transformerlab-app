import React, { useEffect, useState } from 'react';
import styles from './PipelineDiagram.module.css';

const STEPS = [
  { n: 1, label: 'Generate' },
  { n: 2, label: 'Read its doubt' },
  { n: 3, label: 'Relabel' },
  { n: 4, label: 'Fine-tune' },
  { n: 5, label: 'Abstains' },
];

const EX = {
  q: 'Who directed the 1971 film "Wake in Fright"?',
  a: 'Nicolas Roeg',
  conf: 0.27,
};

function Stage({ active }: { active: number }): JSX.Element {
  // The viewport content for the example as it moves through the pipeline.
  switch (active) {
    case 0:
      return (
        <div className={styles.frame} key="s0">
          <div className={styles.caption}>
            The frozen base model answers a training question on its own.
          </div>
          <div className={styles.bubbleRow}>
            <div className={styles.qBubble}>{EX.q}</div>
            <div className={styles.arrowSmall}>&rarr;</div>
            <div className={styles.aBubble}>{EX.a}</div>
          </div>
        </div>
      );
    case 1:
      return (
        <div className={styles.frame} key="s1">
          <div className={styles.caption}>
            We read the average probability the model placed on its own answer.
            That is its confidence, recorded once and then frozen.
          </div>
          <div className={styles.meterWrap}>
            <div className={styles.meterTrack}>
              <div
                className={styles.meterGrow}
                style={{ width: `${EX.conf * 100}%` }}
              />
            </div>
            <span className={styles.meterPct}>
              {Math.round(EX.conf * 100)}% confident
            </span>
          </div>
        </div>
      );
    case 2:
      return (
        <div className={styles.frame} key="s2">
          <div className={styles.caption}>
            Low confidence, so the target is swapped to &ldquo;I&rsquo;m not
            sure.&rdquo; No correctness label is consulted.
          </div>
          <div className={styles.flipRow}>
            <span className={styles.oldTarget}>{EX.a}</span>
            <span className={styles.arrowSmall}>&rarr;</span>
            <span className={styles.newTarget}>
              &ldquo;I&rsquo;m not sure.&rdquo;
            </span>
          </div>
        </div>
      );
    case 3:
      return (
        <div className={styles.frame} key="s3">
          <div className={styles.caption}>
            Train a small LoRA adapter on this homemade dataset.
          </div>
          <div className={styles.adapterRow}>
            <span className={styles.chipBase}>base model</span>
            <span className={styles.plus}>+</span>
            <span className={styles.chipLora}>LoRA adapter</span>
            <span className={styles.stamp}>no labels used</span>
          </div>
        </div>
      );
    default:
      return (
        <div className={styles.frame} key="s4">
          <div className={styles.caption}>
            The tuned model now says &ldquo;I&rsquo;m not sure&rdquo; natively,
            right where its own confidence was low.
          </div>
          <div className={styles.bubbleRow}>
            <div className={styles.qBubble}>a question it is unsure about</div>
            <div className={styles.arrowSmall}>&rarr;</div>
            <div className={styles.abstainBubble}>
              &ldquo;I&rsquo;m not sure.&rdquo;
            </div>
          </div>
        </div>
      );
  }
}

export default function PipelineDiagram(): JSX.Element {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setActive((a) => (a + 1) % STEPS.length),
      2100,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.rail}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.n}>
            <div
              className={[
                styles.node,
                i === active ? styles.nodeActive : '',
                i < active ? styles.nodeDone : '',
              ].join(' ')}
            >
              <span className={styles.badge}>{s.n}</span>
              <span className={styles.nodeLabel}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`${styles.connector} ${i < active ? styles.connectorOn : ''}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.viewport}>
        <Stage active={active} />
      </div>

      <div className={styles.dots}>
        {STEPS.map((s, i) => (
          <span
            key={s.n}
            className={`${styles.dot} ${i === active ? styles.dotOn : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
