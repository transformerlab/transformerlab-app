import React, { useEffect, useState } from 'react';
import styles from './RepetitionLoopDiagram.module.css';

// ledger: single-shot SWE-Bench scaffold, 9000-token cap (B4); 21/30 runs looped to the cap,
//   20 of them with no patch (E21); 6/30 resolved overall (E21).

const CAP = 9000; // tokens, B4
const PREFIX = [
  '<<<<<<< SEARCH',
  'if user is None:',
  '    raise ValueError',
  '=======',
  'if user is None:',
  '    raise ValueError',
];
const LOOP_FRAG = '>>>>>>> REPLACE';
const TOKENS_PER_LOOP = 600; // so the counter reaches 9000 in ~15 repeats
const MAX_LOOPS = 15;
const TICK_MS = 240;
const HOLD_TICKS = 12;

const PREFIX_FRAMES = PREFIX.length;
const MAX_FRAME = PREFIX_FRAMES + MAX_LOOPS; // last frame = cap reached

export default function RepetitionLoopDiagram(): JSX.Element {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let hold = 0;
    const id = setInterval(() => {
      setFrame((f) => {
        if (f >= MAX_FRAME) {
          hold += 1;
          if (hold >= HOLD_TICKS) {
            hold = 0;
            return 0;
          }
          return f;
        }
        return f + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const prefixShown = Math.min(frame, PREFIX_FRAMES);
  const loops = Math.max(0, frame - PREFIX_FRAMES);
  const tokens = Math.min(CAP, prefixShown * 8 + loops * TOKENS_PER_LOOP);
  const capped = tokens >= CAP;
  const visibleLoops = Math.min(loops, 6);
  const hiddenLoops = loops - visibleLoops;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        The model loops instead of stopping when it runs as an agent
      </div>

      <div className={styles.meter}>
        <div className={styles.meterLabel}>
          tokens generated:{' '}
          <strong className={capped ? styles.capText : ''}>
            {tokens.toLocaleString()}
          </strong>{' '}
          / {CAP.toLocaleString()} cap
        </div>
        <div className={styles.track}>
          <div
            className={`${styles.fill} ${capped ? styles.fillCapped : ''}`}
            style={{ width: `${(tokens / CAP) * 100}%` }}
          />
        </div>
      </div>

      <div className={styles.transcript}>
        {PREFIX.slice(0, prefixShown).map((t, i) => (
          <div key={`p${i}`} className={styles.line}>
            {t}
          </div>
        ))}
        {hiddenLoops > 0 && (
          <div className={styles.ellipsis}>
            … {hiddenLoops} more identical lines …
          </div>
        )}
        {Array.from({ length: visibleLoops }, (_, i) => (
          <div key={`l${i}`} className={styles.loopLine}>
            {LOOP_FRAG}
          </div>
        ))}
        {capped && (
          <div className={styles.stamp}>
            9000-token cap reached, no patch emitted
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button className={styles.ctrl} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className={styles.ctrl}
          onClick={() => {
            setFrame(0);
            setPlaying(true);
          }}
        >
          Restart
        </button>
      </div>

      <div className={styles.tally}>
        <span className={styles.tallyBig}>21 of 30</span> runs ended like this,
        looping to the token cap. 20 of them produced no patch at all. When the
        model did stop, the patch was usually correct.
      </div>

      <div className={styles.caption}>
        The repeated line is the model re-emitting the same code-edit marker
        instead of finishing. The 4-bit model has the memory and speed to spare.
        As an agent it often will not stop, which points the fix at the decoding
        and stopping rules rather than the quantization.
      </div>
    </div>
  );
}
