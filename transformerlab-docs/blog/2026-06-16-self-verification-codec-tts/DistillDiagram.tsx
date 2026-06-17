import React from 'react';

/**
 * Static diagram for the distillation step: collect the self-verified best
 * takes from best-of-N, fine-tune the model on them with a small LoRA, and the
 * improved model then produces a clean take in a single shot — no extra samples
 * and no ASR verifier at inference time.
 *
 * Theme-aware: strokes and text use `currentColor`, so it adapts to
 * light/dark mode. The "good" accent is a fixed accessible green.
 */
export default function DistillDiagram(): JSX.Element {
  const ok = '#2e8b57';

  // y-centres for the three collected best-take rows
  const rows = [52, 104, 156];

  // a small "speech" waveform glyph starting at (x, y)
  const speech = (x: number, y: number) =>
    `M${x} ${y} q6 -14 12 0 q6 16 12 0 q6 -18 12 0 q6 12 12 0 q6 -10 12 0`;

  return (
    <figure style={{ margin: '2rem 0' }}>
      <svg
        viewBox="0 0 760 220"
        role="img"
        aria-label="The self-verified best takes are used to fine-tune the model with a small LoRA; the improved model then produces a clean take in a single shot, with no extra samples and no ASR at inference."
        style={{
          width: '100%',
          height: 'auto',
          color: 'var(--ifm-font-color-base)',
        }}
        fill="none"
      >
        {/* Stage labels */}
        <g
          fontSize="12"
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          <text x="65" y="18">
            Best takes
          </text>
          <text x="265" y="18">
            Fine-tune (LoRA)
          </text>
          <text x="445" y="18">
            Improved model
          </text>
          <text x="660" y="18">
            One shot, clean
          </text>
        </g>

        {/* Collected self-verified best takes (all clean) */}
        {rows.map((y, i) => (
          <g key={`best-${i}`}>
            <rect
              x="20"
              y={y - 18}
              width="90"
              height="36"
              rx="8"
              stroke={ok}
              strokeWidth={1.25}
              opacity={0.85}
            />
            <path
              d={speech(34, y)}
              stroke={ok}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
            <text
              x="98"
              y={y + 5}
              fontSize="13"
              fontWeight={700}
              textAnchor="middle"
              fill={ok}
            >
              ✓
            </text>
            {/* merge arrow into the fine-tune box */}
            <path
              d={`M110 ${y} C 150 ${y}, 160 104, 200 104`}
              stroke="currentColor"
              strokeWidth={1.25}
              opacity={0.5}
            />
          </g>
        ))}

        {/* Fine-tune box (model + LoRA badge) */}
        <rect
          x="200"
          y="74"
          width="130"
          height="60"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <text
          x="265"
          y="100"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
        >
          TTS model
        </text>
        <rect
          x="232"
          y="108"
          width="66"
          height="20"
          rx="6"
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.7}
        />
        <text
          x="265"
          y="122"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.8}
        >
          + LoRA
        </text>

        {/* arrow: fine-tune -> improved model */}
        <path
          d="M330 104 L382 104"
          stroke="currentColor"
          strokeWidth={1.25}
          markerEnd="url(#d-arrow)"
        />

        {/* Improved model box */}
        <rect
          x="384"
          y="74"
          width="120"
          height="60"
          rx="8"
          stroke={ok}
          strokeWidth={1.5}
        />
        <text
          x="444"
          y="100"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
        >
          improved
        </text>
        <text
          x="444"
          y="118"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
        >
          model
        </text>

        {/* inference: one prompt -> one clean take, no sampling, no ASR */}
        <path
          d="M504 104 L556 104"
          stroke="currentColor"
          strokeWidth={1.25}
          markerEnd="url(#d-arrow)"
        />

        <rect
          x="556"
          y="86"
          width="64"
          height="36"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.8}
        />
        <text
          x="588"
          y="108"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.7}
        >
          prompt
        </text>

        <path
          d="M620 104 L656 104"
          stroke={ok}
          strokeWidth={1.75}
          markerEnd="url(#d-arrowOk)"
        />

        <rect
          x="656"
          y="78"
          width="84"
          height="52"
          rx="8"
          stroke={ok}
          strokeWidth={1.75}
        />
        <path
          d={speech(666, 104)}
          stroke={ok}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
        <text
          x="726"
          y="110"
          fontSize="14"
          fontWeight={700}
          textAnchor="middle"
          fill={ok}
        >
          ✓
        </text>

        {/* arrowheads */}
        <defs>
          <marker
            id="d-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" opacity={0.6} />
          </marker>
          <marker
            id="d-arrowOk"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={ok} />
          </marker>
        </defs>
      </svg>
      <figcaption
        style={{
          fontSize: '0.85rem',
          textAlign: 'center',
          opacity: 0.7,
          marginTop: '0.5rem',
        }}
      >
        Distillation: fine-tune the model (a small LoRA) on its own
        self-verified best takes, so ordinary single-shot decoding inherits the
        cleaner behaviour — no extra samples and no ASR verifier at inference
        time.
      </figcaption>
    </figure>
  );
}
