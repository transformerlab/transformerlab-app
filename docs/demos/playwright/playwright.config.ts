import { defineConfig } from '@playwright/test';

const recordVideo = process.env.RECORD_VIDEO === '1';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1920, height: 1080 },
    ...(recordVideo && {
      video: {
        mode: 'on' as const,
        size: { width: 1920, height: 1080 },
      },
    }),
  },
  outputDir: './test-results',
  projects: [
    {
      name: 'chromium',
      use: {
        channel: 'chrome',
        deviceScaleFactor: 2,
      },
    },
  ],
});
