import React, { useRef } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
} from "remotion";
import { BrowserFrame } from "./BrowserFrame";
import { CursorOverlay } from "./CursorOverlay";
import { NarrationOverlay } from "./NarrationOverlay";

const TOOLBAR_HEIGHT = 48;

/**
 * Main composition: wraps the Playwright-recorded video in a browser frame,
 * overlays an animated cursor and narration text.
 */
export const MnistDemo: React.FC = () => {
  const { width, height } = useVideoConfig();
  const contentHeight = height - TOOLBAR_HEIGHT;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <BrowserFrame>
        {/* Recorded video */}
        <OffthreadVideo
          src={staticFile("demo.webm")}
          style={{
            width: width,
            height: contentHeight,
            objectFit: "cover",
          }}
        />

        {/* Cursor overlay */}
        <CursorOverlay contentWidth={width} contentHeight={contentHeight} />

        {/* Narration text overlay */}
        <NarrationOverlay />
      </BrowserFrame>
    </AbsoluteFill>
  );
};
