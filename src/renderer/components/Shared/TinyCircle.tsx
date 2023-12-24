import * as React from 'react';

export default function TinyCircle({
  size = 6,
  color = 'var(--joy-palette-success-400)',
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size * 2}
      height={size * 2}
      fill="none"
      viewBox={`0 0 ${size * 2} ${size * 2}`}
    >
      <circle cx={size} cy={size} r={size} fill={color} />
    </svg>
  );
}
