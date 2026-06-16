import React from 'react';

/**
 * Static, theme-aware overview of the VLM-judge evaluation protocol:
 * a pair of meshes for the same input photo -> a fixed 24-view headless
 * render rig -> two *independent* VLM judge families, each queried in both
 * presentation orders -> keep only the order-consistent verdicts -> report
 * cross-model agreement. The cheap proxies are scored against the same
 * (de-biased) reference.
 *
 * Strokes and text use `currentColor` / Infima CSS vars so the figure adapts
 * to light and dark mode. The green accent marks the de-biased reference path.
 */
export default function JudgeProtocolDiagram(): JSX.Element {
  const ok = '#2e8b57';

  return (
    <figure style={{ margin: '2rem 0' }}>
      <svg
        viewBox="0 0 820 300"
        role="img"
        aria-label="A mesh pair is rendered from 24 views, judged by two independent VLM families in both presentation orders, order-inconsistent verdicts are discarded, and cross-model agreement is reported; cheap proxies are scored against the same de-biased reference."
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
          <text x="80" y="20">
            Mesh pair
          </text>
          <text x="270" y="20">
            24-view render rig
          </text>
          <text x="490" y="20">
            Two independent judges
          </text>
          <text x="730" y="20">
            De-biased verdict
          </text>
        </g>

        {/* Mesh pair box */}
        <rect
          x="20"
          y="110"
          width="120"
          height="80"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <text
          x="80"
          y="142"
          fontSize="13"
          textAnchor="middle"
          fill="currentColor"
        >
          mesh A
        </text>
        <text
          x="80"
          y="148"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.5}
        >
          vs
        </text>
        <text
          x="80"
          y="168"
          fontSize="13"
          textAnchor="middle"
          fill="currentColor"
        >
          mesh B
        </text>

        {/* arrow -> render rig */}
        <path
          d="M140 150 L200 150"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.5}
          markerEnd="url(#jp-arrow)"
        />

        {/* Render rig box (camera ring suggestion) */}
        <rect
          x="200"
          y="110"
          width="140"
          height="80"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const r = 26;
          const cx = 270;
          const cy = 150;
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={cx + r * Math.cos(rad)}
              cy={cy + r * Math.sin(rad)}
              r={3}
              fill="currentColor"
              opacity={0.55}
            />
          );
        })}
        <text
          x="270"
          y="154"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          24 views
        </text>

        {/* arrow -> judges */}
        <path
          d="M340 150 L400 150"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.5}
          markerEnd="url(#jp-arrow)"
        />

        {/* Judge X */}
        <rect
          x="400"
          y="92"
          width="180"
          height="48"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <text
          x="490"
          y="112"
          fontSize="12"
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          Judge X · Qwen2.5-VL-7B
        </text>
        <text
          x="490"
          y="129"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          both orders: (A,B) and (B,A)
        </text>

        {/* Judge Y */}
        <rect
          x="400"
          y="160"
          width="180"
          height="48"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <text
          x="490"
          y="180"
          fontSize="12"
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          Judge Y · InternVL3-8B
        </text>
        <text
          x="490"
          y="197"
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          independent validation
        </text>

        {/* arrows judges -> filter */}
        <path
          d="M580 116 C 620 116, 620 150, 650 150"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.5}
          markerEnd="url(#jp-arrow)"
        />
        <path
          d="M580 184 C 620 184, 620 150, 650 150"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.5}
          markerEnd="url(#jp-arrow)"
        />

        {/* Keep-consistent / agreement box */}
        <rect
          x="650"
          y="118"
          width="150"
          height="64"
          rx="8"
          stroke={ok}
          strokeWidth={1.75}
        />
        <text
          x="725"
          y="142"
          fontSize="12"
          textAnchor="middle"
          fill="currentColor"
        >
          keep order-consistent
        </text>
        <text
          x="725"
          y="163"
          fontSize="13"
          fontWeight={700}
          textAnchor="middle"
          fill={ok}
        >
          &#954; = 0.66
        </text>

        {/* Proxy branch underneath */}
        <path
          d="M270 190 L270 248"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.4}
          markerEnd="url(#jp-arrow)"
        />
        <rect
          x="180"
          y="248"
          width="180"
          height="40"
          rx="8"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeDasharray="4 3"
          opacity={0.85}
        />
        <text
          x="270"
          y="272"
          fontSize="11.5"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.8}
        >
          cheap proxies (geometry, CLIP)
        </text>
        <path
          d="M360 268 C 520 268, 600 210, 690 184"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.4}
          markerEnd="url(#jp-arrow)"
        />
        <text
          x="540"
          y="262"
          fontSize="10.5"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.5}
        >
          scored against the de-biased judge
        </text>

        <defs>
          <marker
            id="jp-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" opacity={0.5} />
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
        The protocol: render each mesh pair from a fixed 24-view rig, ask{' '}
        <em>two independent</em> VLM judges to pick the better one in{' '}
        <em>both</em> presentation orders, and keep only the verdicts that
        survive the swap. Cross-model agreement (Cohen&rsquo;s &#954;) is the
        reliability check; the cheap proxies are scored against this same
        reference.
      </figcaption>
    </figure>
  );
}
