import React, { useEffect, useState } from 'react';
import styles from './TokenGenDiagram.module.css';

// Each entry is one generation step: the candidate next-tokens the model weighs,
// with the probability it assigns to each (the softmax of the logits). `chosen`
// is the index it picks. The point of the diagram: the instant a token is picked,
// every one of these probabilities is thrown away — only the token survives.
type Cand = { tok: string; p: number };
type Step = { cands: Cand[]; chosen: number };

const START = ['The', 'Eiffel', 'Tower', 'is', 'in'];

const STEPS: Step[] = [
  {
    cands: [
      { tok: 'Paris', p: 0.93 },
      { tok: 'France', p: 0.04 },
      { tok: 'Lyon', p: 0.02 },
      { tok: 'the', p: 0.01 },
    ],
    chosen: 0,
  },
  {
    cands: [
      { tok: ',', p: 0.52 },
      { tok: '.', p: 0.31 },
      { tok: 'and', p: 0.11 },
      { tok: 'which', p: 0.06 },
    ],
    chosen: 0,
  },
  {
    cands: [
      { tok: 'the', p: 0.46 },
      { tok: 'a', p: 0.29 },
      { tok: 'capital', p: 0.16 },
      { tok: 'heart', p: 0.09 },
    ],
    chosen: 0,
  },
];

const PHASES = 3; // 0: weigh candidates, 1: pick the top, 2: discard the logprobs
const STEP_MS = 1500;

export default function TokenGenDiagram(): JSX.Element {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setTick((t) => (t + 1) % (STEPS.length * PHASES)),
      STEP_MS,
    );
    return () => clearInterval(id);
  }, []);

  const step = Math.floor(tick / PHASES);
  const phase = tick % PHASES;

  const cur = STEPS[step];
  const committed = [
    ...START,
    ...STEPS.slice(0, step).map((s) => s.cands[s.chosen].tok),
  ];
  const chosenTok = cur.cands[cur.chosen].tok;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        How a language model writes &mdash; one token at a time
      </div>

      <div className={styles.stream}>
        {committed.map((t, i) => (
          <span key={`${t}-${i}`} className={styles.tok}>
            {t}
          </span>
        ))}
        <span
          className={[
            styles.slot,
            phase === 0 ? styles.slotWeighing : '',
            phase >= 1 ? styles.slotFilled : '',
          ].join(' ')}
        >
          {phase === 0 ? '▮' : chosenTok}
        </span>
      </div>

      <div className={styles.distArea}>
        <div
          className={`${styles.dist} ${phase === 2 ? styles.distDiscarded : ''}`}
        >
          <div className={styles.distHead}>
            next-token probabilities (logprobs)
          </div>
          {cur.cands.map((c, i) => {
            const isTop = i === cur.chosen;
            return (
              <div
                key={c.tok}
                className={`${styles.bar} ${isTop && phase >= 1 ? styles.barPicked : ''}`}
              >
                <span className={styles.barTok}>{c.tok}</span>
                <span className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    style={{ width: `${c.p * 100}%` }}
                  />
                </span>
                <span className={styles.barP}>{c.p.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        {phase === 2 && (
          <div className={styles.discardStamp}>logprobs discarded &#10005;</div>
        )}
      </div>

      <div className={styles.label}>
        <strong>The LLM chooses the next token and discards the logprobs.</strong>{' '}
        Whatever confidence it had in that pick is gone. Only the token is
        appended to the history and fed back in &mdash; replayed from then on as
        if it had always been certain.
      </div>
    </div>
  );
}
