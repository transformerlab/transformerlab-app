import React, { useState } from 'react';
import styles from './ProxyBimodalDiagram.module.css';

/**
 * Interactive subgroup explorer for the central "cheap proxies are bimodal"
 * finding. Pick a pair type and compare the cheap geometry-validity proxy and
 * render-CLIP against the VLM judge's own cross-model agreement, all relative
 * to the 0.5 chance line.
 *
 * Numbers are the per-subgroup agreements from the paper's subgroup table
 * (agreement with the independent judge Y; judge column is X<->Y agreement).
 * The story: geometry is strong where the defect is visible and collapses to
 * chance on the ambiguous contrast, while the judge stays reliable throughout.
 */

interface Subgroup {
  key: string;
  label: string;
  n: number;
  geometry: number;
  renderClip: number;
  judge: number;
  visible: boolean; // visible-defect contrast vs ambiguous
  takeaway: string;
  note?: string;
}

const SUBGROUPS: Subgroup[] = [
  {
    key: 'xgen-full',
    label: 'Cross-generator',
    n: 43,
    geometry: 0.91,
    renderClip: 0.37,
    judge: 0.95,
    visible: true,
    takeaway:
      'Telling Stable Fast 3D apart from TripoSR is a visible-defect contrast: geometry validity nails it (0.91) and the judges nearly always agree. This is the easy regime where proxies are usually reported to "work".',
  },
  {
    key: 'within-triposr',
    label: 'Within-TripoSR',
    n: 50,
    geometry: 0.8,
    renderClip: 0.7,
    judge: 0.97,
    visible: true,
    takeaway:
      'TripoSR meshes are watertight, so dropping faces punches visible holes. The defect is salient in the render, geometry stays well above chance (0.80), and the judges agree almost perfectly.',
  },
  {
    key: 'xgen-mixed',
    label: 'Cross-generator (mixed)',
    n: 119,
    geometry: 0.53,
    renderClip: 0.46,
    judge: 0.72,
    visible: false,
    takeaway:
      'This is the ambiguous regime that matters for ranking a single model, and geometry validity falls to chance (0.53). The judge still carries real signal (0.72). A proxy that looks great on the easy contrasts hides chance-level behaviour right here.',
  },
  {
    key: 'within-sf3d',
    label: 'Within-Stable Fast 3D †',
    n: 50,
    geometry: 0.4,
    renderClip: 0.38,
    judge: 0.82,
    visible: false,
    note: 'Confounded: Stable Fast 3D meshes are open shells, so face-dropping is barely visible at 256px and the judge’s own intact-vs-degraded call is itself at chance here. We exclude this cell from the proxy-failure claim.',
    takeaway:
      'Here the proxy reads below chance, but this cell is confounded: face-dropping an open shell is barely visible, so the judge itself is unreliable. We do not lean on it; it measures reference noise, not a clean proxy failure.',
  },
];

const METRICS: { key: keyof Subgroup; label: string }[] = [
  { key: 'geometry', label: 'Geometry proxy' },
  { key: 'renderClip', label: 'Render-CLIP' },
  { key: 'judge', label: 'Judge X↔Y' },
];

function barColor(metricKey: string, value: number): string {
  if (metricKey === 'judge') return 'var(--ifm-color-primary)';
  // proxy bars: green when clearly above chance, amber near chance, red below
  if (value >= 0.65) return '#2e8b57';
  if (value >= 0.55) return '#caa53b';
  return '#d9534f';
}

export default function ProxyBimodalDiagram(): React.ReactElement {
  const [active, setActive] = useState(0);
  const sg = SUBGROUPS[active];

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>
        Does the cheap proxy track the judge? Depends on the contrast.
      </div>
      <div className={styles.subtitle}>
        Agreement with the independent VLM judge, by pair type. Pick a contrast
        and compare the cheap proxies against the judge&rsquo;s own cross-model
        agreement. Dashed line is chance (0.5).
      </div>

      <div className={styles.tabs}>
        {SUBGROUPS.map((s, i) => (
          <button
            key={s.key}
            className={`${styles.tab} ${i === active ? styles.tabActive : ''} ${
              i === active
                ? ''
                : s.visible
                  ? styles.tabVisible
                  : styles.tabAmbiguous
            }`}
            onClick={() => setActive(i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.chart}>
        {METRICS.map((m) => {
          const value = sg[m.key] as number;
          return (
            <div className={styles.row} key={m.key}>
              <div className={styles.rowLabel}>{m.label}</div>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  style={{
                    width: `${value * 100}%`,
                    backgroundColor: barColor(m.key as string, value),
                  }}
                />
              </div>
              <div className={styles.rowValue}>{value.toFixed(2)}</div>
            </div>
          );
        })}
        <div className={styles.chance} />
        <div className={styles.chanceLabel}>chance</div>
      </div>

      <div className={styles.takeaway}>{sg.takeaway}</div>
      <div className={styles.meta}>
        n = {sg.n} pairs ·{' '}
        {sg.visible ? 'visible-defect contrast' : 'ambiguous contrast'}
        {sg.note ? ` · ${sg.note}` : ''}
      </div>
    </div>
  );
}
