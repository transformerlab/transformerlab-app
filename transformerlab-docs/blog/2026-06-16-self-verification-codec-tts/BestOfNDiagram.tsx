import React from 'react';

/**
 * Static diagram for the best-of-N self-verification fix:
 * one prompt → the TTS model draws several candidate takes →
 * ASR transcribes each → keep the take whose transcript matches the text.
 *
 * Theme-aware: strokes and text use `currentColor`, so it adapts to
 * light/dark mode. Pass/fail accents use fixed accessible green/red.
 */
export default function BestOfNDiagram(): JSX.Element {
  const ok = '#2e8b57';
  const bad = '#d9534f';

  // y-centres for the three candidate rows
  const rows = [56, 130, 204];

  return (
    <figure style={{ margin: '2rem 0' }}>
      <svg
        viewBox="0 0 760 260"
        role="img"
        aria-label="One prompt is sampled into several candidate takes; each is transcribed by ASR; the take whose transcript matches the text is kept."
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
          <text x="70" y="20">
            Prompt
          </text>
          <text x="300" y="20">
            Sample N takes
          </text>
          <text x="500" y="20">
            Transcribe (ASR)
          </text>
          <text x="680" y="20">
            Keep the match
          </text>
        </g>

        {/* Prompt / TTS model box */}
        <rect
          x="20"
          y="100"
          width="100"
          height="60"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <text
          x="70"
          y="126"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
        >
          TTS model
        </text>
        <text
          x="70"
          y="144"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          “…brown fox”
        </text>

        {/* Fan-out arrows from model to each candidate */}
        {rows.map((y) => (
          <path
            key={`fan-${y}`}
            d={`M120 130 C 160 130, 170 ${y}, 200 ${y}`}
            stroke="currentColor"
            strokeWidth={1.25}
            opacity={0.5}
          />
        ))}

        {/* Candidate takes (waveforms) + ASR transcripts + verdicts */}
        {[
          { wave: 'flat', text: '(silence)', good: false },
          { wave: 'speech', text: '“…brown fox”', good: true },
          { wave: 'loop', text: '“fox fox fox”', good: false },
        ].map((c, i) => {
          const y = rows[i];
          const accent = c.good ? ok : bad;
          // simple waveform glyphs
          const wave =
            c.wave === 'flat'
              ? `M210 ${y} L290 ${y}`
              : c.wave === 'loop'
                ? `M210 ${y} q10 -14 20 0 q10 14 20 0 q10 -14 20 0 q10 14 20 0`
                : `M210 ${y} q6 -16 12 0 q6 18 12 0 q6 -22 12 0 q6 14 12 0 q6 -10 12 0 q6 16 12 0`;
          return (
            <g key={`cand-${i}`}>
              {/* candidate take */}
              <rect
                x="200"
                y={y - 26}
                width="100"
                height="52"
                rx="8"
                stroke="currentColor"
                strokeWidth={1.25}
                opacity={0.8}
              />
              <path
                d={wave}
                stroke={accent}
                strokeWidth={1.75}
                strokeLinecap="round"
              />

              {/* arrow candidate -> transcript */}
              <path
                d={`M300 ${y} L360 ${y}`}
                stroke="currentColor"
                strokeWidth={1.25}
                opacity={0.5}
                markerEnd="url(#arrow)"
              />

              {/* transcript box */}
              <rect
                x="360"
                y={y - 20}
                width="160"
                height="40"
                rx="8"
                stroke="currentColor"
                strokeWidth={1.25}
                opacity={0.8}
              />
              <text
                x="440"
                y={y + 4}
                fontSize="12"
                textAnchor="middle"
                fill="currentColor"
              >
                {c.text}
              </text>

              {/* verdict */}
              <text
                x="548"
                y={y + 6}
                fontSize="18"
                fontWeight={700}
                textAnchor="middle"
                fill={accent}
              >
                {c.good ? '✓' : '✗'}
              </text>
            </g>
          );
        })}

        {/* arrow from the matching transcript to the kept take */}
        <path
          d={`M572 ${rows[1]} C 620 ${rows[1]}, 620 ${rows[1]}, 640 ${rows[1]}`}
          stroke={ok}
          strokeWidth={1.75}
          markerEnd="url(#arrowOk)"
        />

        {/* kept take box */}
        <rect
          x="640"
          y={rows[1] - 26}
          width="100"
          height="52"
          rx="8"
          stroke={ok}
          strokeWidth={1.75}
        />
        <text
          x="690"
          y={rows[1] + 4}
          fontSize="12"
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          clean take
        </text>

        {/* arrowheads */}
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" opacity={0.5} />
          </marker>
          <marker
            id="arrowOk"
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
        Best-of-N self-verification: sample several takes for one prompt,
        transcribe each with ASR, and keep the take whose transcript matches the
        text. A prompt only fails if <em>every</em> take is broken.
      </figcaption>
    </figure>
  );
}
