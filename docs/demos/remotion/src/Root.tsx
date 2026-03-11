import React from "react";
import { Composition } from "remotion";
import { MnistDemo } from "./MnistDemo";

/**
 * 43 seconds × 25 fps = 1075 frames.
 * Matches the Playwright-recorded video dimensions and frame rate.
 */
const FPS = 25;
const DURATION_FRAMES = 1075;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MnistDemo"
        component={MnistDemo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
