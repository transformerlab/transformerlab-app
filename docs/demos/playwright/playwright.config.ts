import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for demo scripts.
 * Run with: npx playwright test --config docs/demos/playwright/playwright.config.ts
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://beta.lab.cloud',
    trace: 'on',
    video: 'on',
    launchOptions: {
      slowMo: 500, // Slow down actions for demo recording
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
