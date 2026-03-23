import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test/playwright',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:8338',

    /* Collect trace when retrying a failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture screenshot on failure for debugging */
    screenshot: 'only-on-failure',
  },

  /* Run fast smoke tests first, then full E2E tests */
  projects: [
    {
      name: 'smoke',
      testMatch: ['homepage.spec.ts', 'smoke-screens.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testMatch: ['**/*.spec.ts'],
      testIgnore: ['homepage.spec.ts', 'smoke-screens.spec.ts'],
      dependencies: ['smoke'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
