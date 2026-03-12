import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { cursorKeyframes } from "./data";

/**
 * Interpolate cursor position between keyframes.
 * Returns { x, y, clicking } where clicking is true near a keyframe.
 */
function getCursorState(
  timeSec: number,
  contentWidth: number,
  contentHeight: number,
) {
  const kf = cursorKeyframes;

  // Before first keyframe — sit at first position
  if (timeSec <= kf[0].timeSec) {
    return {
      x: (kf[0].x / 1920) * contentWidth,
      y: (kf[0].y / 1080) * contentHeight,
      clicking: false,
      opacity: timeSec < kf[0].timeSec - 0.5 ? 0 : 1,
    };
  }

  // After last keyframe — sit at last position
  if (timeSec >= kf[kf.length - 1].timeSec) {
    return {
      x: (kf[kf.length - 1].x / 1920) * contentWidth,
      y: (kf[kf.length - 1].y / 1080) * contentHeight,
      clicking: false,
      opacity: 1,
    };
  }

  // Find surrounding keyframes
  let i = 0;
  while (i < kf.length - 1 && kf[i + 1].timeSec <= timeSec) {
    i++;
  }
  const from = kf[i];
  const to = kf[i + 1];
  const span = to.timeSec - from.timeSec;
  const t = Math.min((timeSec - from.timeSec) / span, 1);

  // Ease in-out cubic
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const x =
    ((from.x + (to.x - from.x) * ease) / 1920) * contentWidth;
  const y =
    ((from.y + (to.y - from.y) * ease) / 1080) * contentHeight;

  // Clicking: true when within 0.15s of a keyframe
  const distTo = Math.abs(timeSec - to.timeSec);
  const distFrom = Math.abs(timeSec - from.timeSec);
  const clicking = distTo < 0.15 || distFrom < 0.15;

  return { x, y, clicking, opacity: 1 };
}

/** Cursor SVG pointer */
const CursorSvg: React.FC<{ clicking: boolean }> = ({ clicking }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    style={{ filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.4))" }}
  >
    <path
      d="M5 3L5 19L9.5 14.5L14 21L16.5 19.5L12 13L18 13L5 3Z"
      fill="white"
      stroke="black"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
    {clicking && (
      <circle cx="5" cy="3" r="8" fill="rgba(59,130,246,0.35)" />
    )}
  </svg>
);

/**
 * Renders an animated cursor that moves between click targets.
 * Shows a click ripple effect at each keyframe.
 */
export const CursorOverlay: React.FC<{
  contentWidth: number;
  contentHeight: number;
}> = ({ contentWidth, contentHeight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const { x, y, clicking, opacity } = getCursorState(
    timeSec,
    contentWidth,
    contentHeight,
  );

  // Click ripple animation
  const nearestKf = cursorKeyframes.reduce((best, kf) =>
    Math.abs(kf.timeSec - timeSec) < Math.abs(best.timeSec - timeSec)
      ? kf
      : best,
  );
  const rippleT = timeSec - nearestKf.timeSec;
  const showRipple = rippleT >= 0 && rippleT < 0.4;
  const rippleScale = showRipple ? interpolate(rippleT, [0, 0.4], [0.3, 1.5]) : 0;
  const rippleOpacity = showRipple
    ? interpolate(rippleT, [0, 0.4], [0.6, 0])
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Ripple */}
      {showRipple && (
        <div
          style={{
            position: "absolute",
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid rgba(59,130,246,0.7)",
            transform: `scale(${rippleScale})`,
            opacity: rippleOpacity,
          }}
        />
      )}

      {/* Cursor */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-2px, -2px) scale(${clicking ? 0.85 : 1})`,
          transition: "transform 0.05s ease",
          opacity,
        }}
      >
        <CursorSvg clicking={clicking} />
      </div>
    </div>
  );
};
