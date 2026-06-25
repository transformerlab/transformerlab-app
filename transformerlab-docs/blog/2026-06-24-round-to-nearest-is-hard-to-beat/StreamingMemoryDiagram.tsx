import React, { useEffect, useState } from 'react';
import styles from './StreamingMemoryDiagram.module.css';

// ledger: 49 decoder layers (E1); streaming-GPTQ full-run peak 3.75 GB, flat per-layer (E16,E17);
//   48 GB dev Mac (E16 context); stock mlx-lm GPTQ needs ~60 GB model + all-layer Hessians, infeasible (E19);
//   ~13x headroom = 48/3.75 (B2).

const N_LAYERS = 49; // E1
const OUR_PEAK = 3.75; // GB, E16
const MAC = 48; // GB, E16 context
const STOCK = 60; // GB, E19
const SCALE_MAX = 66; // GB, top of the gauge
const TICK_MS = 110;
const HOLD_TICKS = 14; // pause at the end before looping

const GW = 360; // gauge svg width
const GH = 260; // gauge svg height
const PAD = { t: 14, b: 26, l: 4, r: 4 };

function gy(gb: number): number {
  return PAD.t + (1 - gb / SCALE_MAX) * (GH - PAD.t - PAD.b);
}

export default function StreamingMemoryDiagram(): JSX.Element {
  const [layer, setLayer] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let hold = 0;
    const id = setInterval(() => {
      setLayer((l) => {
        if (l >= N_LAYERS - 1) {
          hold += 1;
          if (hold >= HOLD_TICKS) {
            hold = 0;
            return 0;
          }
          return l;
        }
        return l + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const done = layer + 1;
  const barTop = gy(OUR_PEAK);
  const barH = GH - PAD.b - barTop;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        Streaming GPTQ quantizes one layer at a time, so peak memory stays flat
      </div>

      <div className={styles.body}>
        <svg
          className={styles.gauge}
          viewBox={`0 0 ${GW} ${GH}`}
          role="img"
          aria-label="Memory gauge showing streaming GPTQ peak holding near 3.75 GB, far below the 48 GB Mac and the 60 GB stock requirement"
        >
          {/* stock GPTQ requirement (infeasible) */}
          <line
            x1={PAD.l}
            x2={GW - PAD.r}
            y1={gy(STOCK)}
            y2={gy(STOCK)}
            className={styles.stockLine}
          />
          <text x={PAD.l + 4} y={gy(STOCK) - 5} className={styles.stockLabel}>
            stock GPTQ needs 60+ GB (cannot run)
          </text>

          {/* 48 GB Mac limit */}
          <line
            x1={PAD.l}
            x2={GW - PAD.r}
            y1={gy(MAC)}
            y2={gy(MAC)}
            className={styles.macLine}
          />
          <text x={PAD.l + 4} y={gy(MAC) - 5} className={styles.macLabel}>
            48 GB Mac limit
          </text>

          {/* our peak bar */}
          <rect
            x={GW / 2 - 70}
            y={barTop}
            width={140}
            height={barH}
            className={styles.ourBar}
            rx={4}
          />
          {/* transient scratch for the current layer, freed each step */}
          <rect
            key={layer}
            x={GW / 2 - 70}
            y={barTop - 16}
            width={140}
            height={16}
            className={styles.scratch}
            rx={3}
          />
          <text
            x={GW / 2}
            y={barTop - 22}
            className={styles.ourLabel}
            textAnchor="middle"
          >
            peak ~3.75 GB
          </text>
        </svg>

        <div className={styles.side}>
          <div className={styles.counter}>
            <span className={styles.counterBig}>{done}</span>
            <span className={styles.counterSmall}>
              {' '}
              / {N_LAYERS} layers quantized
            </span>
          </div>
          <div className={styles.strip}>
            {Array.from({ length: N_LAYERS }, (_, i) => (
              <span
                key={i}
                className={`${styles.cell} ${i < done ? styles.cellDone : ''} ${
                  i === layer ? styles.cellActive : ''
                }`}
              />
            ))}
          </div>
          <div className={styles.readout}>
            About 13 times under the 48 GB box. Each layer&rsquo;s weights and
            statistics are freed before the next one loads, so the peak stays
            flat no matter how deep the model is.
          </div>
          <div className={styles.controls}>
            <button
              className={styles.ctrl}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              className={styles.ctrl}
              onClick={() => {
                setLayer(0);
                setPlaying(true);
              }}
            >
              Restart
            </button>
          </div>
        </div>
      </div>

      <div className={styles.caption}>
        Calibrated GPTQ normally needs the whole 60 GB model plus a statistics
        table per expert, which for 128 experts runs into hundreds of gigabytes.
        Processing one layer at a time holds the peak near 3.75 GB, which is
        what makes this model quantizable on a 48 GB Mac at all.
      </div>
    </div>
  );
}
