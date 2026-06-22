import React, { useState } from 'react';
import styles from './MethodDiagram.module.css';

type Item = { q: string; a: string; conf: number };

// The model's confidence (`conf`) is the mean probability it put on its own answer
// tokens. We deliberately do NOT show whether the answer is right: the method never
// looks at correctness, which is the whole point.
const ITEMS: Item[] = [
  { q: 'What is the capital of France?', a: 'Paris', conf: 0.96 },
  {
    q: 'Who wrote the novel "The Black Dahlia"?',
    a: 'James Ellroy',
    conf: 0.79,
  },
  { q: 'What is the atomic number of tungsten?', a: '74', conf: 0.61 },
  { q: 'What is the capital of Australia?', a: 'Sydney', conf: 0.55 },
  {
    q: 'In what year was the painter Élisabeth Vigée Le Brun born?',
    a: '1779',
    conf: 0.38,
  },
  {
    q: 'Who directed the 1971 film "Wake in Fright"?',
    a: 'Nicolas Roeg',
    conf: 0.27,
  },
];

export default function MethodDiagram(): JSX.Element {
  const [thr, setThr] = useState(0.5);
  const answered = ITEMS.filter((i) => i.conf >= thr).length;

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <label className={styles.label} htmlFor="thr">
          Drag the cutoff: how unsure is <em>too</em> unsure to answer?{' '}
          <span className={styles.thrVal}>{Math.round(thr * 100)}%</span>
        </label>
        <input
          id="thr"
          className={styles.slider}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={thr}
          onChange={(e) => setThr(parseFloat(e.target.value))}
        />
        <div className={styles.legend}>
          <span>
            <span className={`${styles.dot} ${styles.dotKeep}`} /> above the
            cutoff &rarr; keep the model&rsquo;s answer
          </span>
          <span>
            <span className={`${styles.dot} ${styles.dotAbstain}`} /> below the
            cutoff &rarr; teach it to say &ldquo;I&rsquo;m not sure&rdquo;
          </span>
        </div>
      </div>

      <div className={styles.grid}>
        {ITEMS.map((it, k) => {
          const abstain = it.conf < thr;
          return (
            <div
              key={k}
              className={`${styles.card} ${abstain ? styles.abstain : styles.keep}`}
            >
              <div className={styles.q}>{it.q}</div>
              <div className={styles.meterRow}>
                <div className={styles.meter}>
                  <div
                    className={styles.meterFill}
                    style={{
                      width: `${it.conf * 100}%`,
                      background: abstain
                        ? 'var(--ifm-color-warning)'
                        : 'var(--ifm-color-success)',
                    }}
                  />
                  <div
                    className={styles.thrMark}
                    style={{ left: `${thr * 100}%` }}
                  />
                </div>
                <span className={styles.confLabel}>
                  {Math.round(it.conf * 100)}%
                </span>
              </div>
              <div className={styles.target}>
                training target:{' '}
                {abstain ? (
                  <span className={styles.tAbstain}>
                    &ldquo;I&rsquo;m not sure.&rdquo;
                  </span>
                ) : (
                  <span className={styles.tKeep}>{it.a}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.caption}>
        The cutoff is the <strong>only</strong> knob. We build the training set
        by hand of the model itself: everything below the cutoff is relabelled
        to &ldquo;I&rsquo;m not sure,&rdquo; everything above keeps the
        model&rsquo;s own answer. Then we fine-tune on that. Notice what decides
        each card: the model&rsquo;s confidence in its own words, never whether
        the answer is actually correct.{' '}
        <strong>No answer key is consulted.</strong>{' '}
        <span className={styles.tally}>
          (Right now the model would answer {answered} of {ITEMS.length} and
          abstain on the rest.)
        </span>
      </div>
    </div>
  );
}
