import React, { useState } from 'react';
import styles from './AdherenceDiagram.module.css';

// ledger: tempo Acc1 SA3 0.608 / DiffR 0.367 / ACE 0.096 = E19;
//         key exact SA3 0.642 / DiffR 0.108 / ACE 0.067 = E21;
//         uniform-random exact-key chance 1/24 = 0.042 = E23.

type Model = 'sa3' | 'diffrhythm' | 'acestep';

const MODELS: { id: Model; label: string }[] = [
  { id: 'sa3', label: 'Stable Audio 3' },
  { id: 'diffrhythm', label: 'DiffRhythm 2' },
  { id: 'acestep', label: 'ACE-Step 1.5' },
];

const DATA: Record<Model, { tempo: number; key: number }> = {
  sa3: { tempo: 0.608, key: 0.642 },
  diffrhythm: { tempo: 0.367, key: 0.108 },
  acestep: { tempo: 0.096, key: 0.067 },
};

const KEY_CHANCE = 0.042; // 1/24 keys

function Gauge({
  label,
  value,
  chance,
}: {
  label: string;
  value: number;
  chance?: number;
}) {
  const pct = Math.round(value * 100);
  const good = value >= 0.3; // a model meaningfully above the chance floor
  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeHead}>
        <span>{label}</span>
        <span className={styles.pct}>{pct}%</span>
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${pct}%`, background: good ? '#2e8b57' : '#d9534f' }}
        />
        {chance !== undefined && (
          <div
            className={styles.chance}
            style={{ left: `${chance * 100}%` }}
            title="chance"
          />
        )}
      </div>
    </div>
  );
}

export default function AdherenceDiagram(): React.ReactElement {
  const [model, setModel] = useState<Model>('sa3');
  const d = DATA[model];
  return (
    <div className={styles.wrapper}>
      <div className={styles.buttons}>
        {MODELS.map((m) => (
          <button
            key={m.id}
            className={`${styles.button} ${model === m.id ? styles.active : ''}`}
            onClick={() => setModel(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Gauge label="Hits the requested tempo (within 4%)" value={d.tempo} />
      <Gauge
        label="Hits the exact requested key"
        value={d.key}
        chance={KEY_CHANCE}
      />
      <p className={styles.caption}>
        The dotted line on the key gauge is random-guess accuracy (1 in 24).
        Stable Audio 3 fills both gauges; ACE-Step sits on the chance line. None
        of the usual quality scores check this.
      </p>
    </div>
  );
}
