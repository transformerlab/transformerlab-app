import React, { useState } from 'react';
import styles from './RadarDiagram.module.css';

// ledger: KAD-630k 2.35/7.08/5.67 = E10; FAD-630k 0.168/0.299/0.265 = E9;
//         Audiobox PQ 7.65/7.38/6.89 = E13; MuQ-MuLan 0.385/0.115/0.168 = E14;
//         tempo Acc1 0.608/0.096/0.367 = E19; key exact 0.642/0.067/0.108 = E21.
//         Each axis normalized to fraction-of-best (best model = 1; lower-better metrics inverted).

type Model = 'sa3' | 'acestep' | 'diffrhythm';

const MODELS: { id: Model; label: string; color: string }[] = [
  { id: 'sa3', label: 'Stable Audio 3', color: '#1b6ca8' },
  { id: 'acestep', label: 'ACE-Step 1.5', color: '#d1495b' },
  { id: 'diffrhythm', label: 'DiffRhythm 2', color: '#edae49' },
];

// order per axis: [sa3, acestep, diffrhythm]
const AXES: {
  label: string;
  vals: [number, number, number];
  lower: boolean;
}[] = [
  { label: 'KAD', vals: [2.35, 7.08, 5.67], lower: true },
  { label: 'FAD', vals: [0.168, 0.299, 0.265], lower: true },
  { label: 'Audiobox', vals: [7.65, 7.38, 6.89], lower: false },
  { label: 'MuQ', vals: [0.385, 0.115, 0.168], lower: false },
  { label: 'Tempo', vals: [0.608, 0.096, 0.367], lower: false },
  { label: 'Key', vals: [0.642, 0.067, 0.108], lower: false },
];

const IDX: Record<Model, 0 | 1 | 2> = { sa3: 0, acestep: 1, diffrhythm: 2 };
const N = AXES.length;
const CX = 170;
const CY = 160;
const R = 115;

function norm(axis: (typeof AXES)[number], i: 0 | 1 | 2): number {
  const best = axis.lower ? Math.min(...axis.vals) : Math.max(...axis.vals);
  return axis.lower ? best / axis.vals[i] : axis.vals[i] / best;
}

function point(i: number, radius: number): [number, number] {
  const a = (-90 + (360 / N) * i) * (Math.PI / 180);
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

function polygon(m: Model): string {
  return AXES.map((ax, i) => point(i, norm(ax, IDX[m]) * R).join(',')).join(
    ' ',
  );
}

export default function RadarDiagram(): React.ReactElement {
  const [active, setActive] = useState<Model>('sa3');
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <div className={styles.wrapper}>
      <div className={styles.buttons}>
        {MODELS.map((m) => (
          <button
            key={m.id}
            className={`${styles.button} ${active === m.id ? styles.active : ''}`}
            style={
              active === m.id
                ? { borderColor: m.color, color: m.color }
                : undefined
            }
            onClick={() => setActive(m.id)}
          >
            <span className={styles.swatch} style={{ background: m.color }} />
            {m.label}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 340 300"
        className={styles.svg}
        role="img"
        aria-label="radar comparing model quality and control"
      >
        {rings.map((r) => (
          <polygon
            key={r}
            points={AXES.map((_, i) => point(i, r * R).join(',')).join(' ')}
            className={styles.ring}
          />
        ))}
        {AXES.map((ax, i) => {
          const [lx, ly] = point(i, R + 18);
          const [ex, ey] = point(i, R);
          return (
            <g key={ax.label}>
              <line x1={CX} y1={CY} x2={ex} y2={ey} className={styles.spoke} />
              <text
                x={lx}
                y={ly}
                className={styles.axisLabel}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {ax.label}
              </text>
            </g>
          );
        })}
        {MODELS.map((m) => {
          const on = active === m.id;
          return (
            <polygon
              key={m.id}
              points={polygon(m.id)}
              fill={m.color}
              fillOpacity={on ? 0.18 : 0.04}
              stroke={m.color}
              strokeWidth={on ? 2.4 : 1}
              strokeOpacity={on ? 1 : 0.35}
            />
          );
        })}
      </svg>
      <p className={styles.caption}>
        Each axis is normalized so the best model reaches the outer edge
        (lower-is-better scores are flipped, so outward always means better).
        Select a model to highlight it. Stable Audio 3 sits on the outer edge of
        all six axes, and the three models only bunch together on Audiobox
        quality.
      </p>
    </div>
  );
}
