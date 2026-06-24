import React, { useEffect, useState } from 'react';
import styles from './CollapseAnimation.module.css';

// ledger: 1.5B measured (reward -> distinct@valid) trajectory points = E18; the collapse
//         from ~1.0 to <0.05 as reward rises = E12; start distinct = 1.0 (B0) = E15.
//         The small level tiles are SCHEMATIC illustrations of "many different vs. one
//         repeated", not recorded level data; only the two gauges carry ledger numbers.

type Point = { reward: number; distinct: number };

// Every pair below is a real measured operating point from 1.5B training (E18).
const TRAJ: Point[] = [
  { reward: 0.25, distinct: 1.0 },
  { reward: 0.35, distinct: 0.89 },
  { reward: 0.47, distinct: 0.51 },
  { reward: 0.52, distinct: 0.42 },
  { reward: 0.58, distinct: 0.42 },
  { reward: 0.69, distinct: 0.4 },
  { reward: 0.75, distinct: 0.24 },
  { reward: 0.86, distinct: 0.19 },
  { reward: 0.9, distinct: 0.08 },
  { reward: 1.0, distinct: 0.02 },
];

const TILE = 5; // a schematic 5x5 level
const STRIP = 8; // how many sample levels we show in the row
const TICK_MS = 760;
const HOLD_TICKS = 5;

// Seeded, deterministic generator. No Math.random()/Date.now() at module scope, so the
// server and client render the identical tiles (no hydration mismatch).
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLevel(seed: number): string[] {
  const rand = makeRng(seed);
  const g: string[][] = [];
  for (let r = 0; r < TILE; r++) {
    const row: string[] = [];
    for (let c = 0; c < TILE; c++) {
      const edge = r === 0 || c === 0 || r === TILE - 1 || c === TILE - 1;
      row.push(edge ? '#' : '.');
    }
    g.push(row);
  }
  const inner: Array<[number, number]> = [];
  for (let r = 1; r < TILE - 1; r++) {
    for (let c = 1; c < TILE - 1; c++) inner.push([r, c]);
  }
  for (let i = inner.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = inner[i];
    inner[i] = inner[j];
    inner[j] = tmp;
  }
  const [pr, pc] = inner[0];
  g[pr][pc] = '@';
  const [br, bc] = inner[1];
  g[br][bc] = '$';
  const [gr, gc] = inner[2];
  g[gr][gc] = 'x';
  const walls = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < walls; k++) {
    const cell = inner[3 + k];
    if (cell) g[cell[0]][cell[1]] = '#';
  }
  return g.map((row) => row.join(''));
}

const LEVELS: string[][] = Array.from({ length: STRIP }, (_, i) =>
  makeLevel(0x9e37 + i * 101),
);
const TEMPLATE: string[] = LEVELS[0];

function cellClass(ch: string): string {
  if (ch === '#') return styles.wall;
  if (ch === '@') return styles.player;
  if (ch === '$') return styles.box;
  if (ch === 'x') return styles.goal;
  return styles.floor;
}

function LevelTile({
  rows,
  dim,
}: {
  rows: string[];
  dim: boolean;
}): React.ReactElement {
  return (
    <div className={dim ? `${styles.tile} ${styles.tileDim}` : styles.tile}>
      {rows.map((row, r) => (
        <div key={r} className={styles.tileRow}>
          {row.split('').map((ch, c) => (
            <span key={c} className={`${styles.cell} ${cellClass(ch)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function CollapseAnimation(): React.ReactElement {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let hold = 0;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= TRAJ.length - 1) {
          hold += 1;
          if (hold >= HOLD_TICKS) {
            hold = 0;
            return 0;
          }
          return i;
        }
        return i + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const { reward, distinct } = TRAJ[idx];
  // collapsed tiles: as distinct@valid falls, more sample levels become the same template.
  const collapsed = Math.round((1 - distinct) * STRIP);
  const distinctClass =
    distinct >= 0.5 ? styles.good : distinct >= 0.3 ? styles.mid : styles.bad;

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button className={styles.button} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className={styles.button}
          onClick={() => {
            setIdx(0);
            setPlaying(true);
          }}
        >
          Restart
        </button>
        <span className={styles.stepLabel}>
          snapshot {idx + 1} / {TRAJ.length}
        </span>
      </div>

      <div className={styles.gauges}>
        <div className={styles.gauge}>
          <div className={styles.gaugeHead}>
            <span>Reward (solvable and right difficulty)</span>
            <span className={styles.gaugeVal}>{reward.toFixed(2)}</span>
          </div>
          <div className={styles.track}>
            <div
              className={`${styles.fill} ${styles.rewardFill}`}
              style={{ width: `${reward * 100}%` }}
            />
          </div>
        </div>
        <div className={styles.gauge}>
          <div className={styles.gaugeHead}>
            <span>Variety (distinct valid levels)</span>
            <span className={styles.gaugeVal}>{distinct.toFixed(2)}</span>
          </div>
          <div className={styles.track}>
            <div
              className={`${styles.fill} ${distinctClass}`}
              style={{ width: `${distinct * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className={styles.strip}>
        {LEVELS.map((lvl, i) => {
          const isCollapsed = i < collapsed;
          return (
            <LevelTile
              key={i}
              rows={isCollapsed ? TEMPLATE : lvl}
              dim={isCollapsed}
            />
          );
        })}
      </div>

      <p className={styles.caption}>
        Press play. Each point is a real snapshot of the smaller (1.5B) model at
        some moment during training, not a single continuous run. Reading left
        to right along rising reward, the share of distinct valid levels
        collapses from about 1.0 to about 0.02. The tiles below the gauges are a
        schematic stand-in (wall, box in orange, goal in red, player in blue):
        as variety drops, more of the eight samples snap to the same single
        template.
      </p>
    </div>
  );
}
