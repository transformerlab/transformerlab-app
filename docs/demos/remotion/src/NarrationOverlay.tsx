import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { narrationSteps } from "./data";

/**
 * Renders a lower-third text overlay showing the current narration step.
 * Fades in/out at step boundaries.
 */
export const NarrationOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  // Find the active narration step
  const activeStep = narrationSteps.find(
    (s) => timeSec >= s.startSec && timeSec < s.endSec,
  );

  if (!activeStep) return null;

  const fadeInDuration = 0.4; // seconds
  const fadeOutDuration = 0.4;

  const opacity = interpolate(
    timeSec,
    [
      activeStep.startSec,
      activeStep.startSec + fadeInDuration,
      activeStep.endSec - fadeOutDuration,
      activeStep.endSec,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const slideY = interpolate(
    timeSec,
    [activeStep.startSec, activeStep.startSec + fadeInDuration],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 20,
        opacity,
        transform: `translateY(${slideY}px)`,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(12px)",
          borderRadius: 12,
          padding: "14px 28px",
          maxWidth: 900,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#60a5fa",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            marginBottom: 6,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {activeStep.title}
        </div>
        <div
          style={{
            color: "#f0f0f0",
            fontSize: 17,
            lineHeight: 1.5,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {activeStep.text}
        </div>
      </div>
    </div>
  );
};
