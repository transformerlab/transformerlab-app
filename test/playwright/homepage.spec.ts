import { test, expect } from '@playwright/test';

test('has title or loads content', async ({ page }) => {
  await page.goto('/');

  // Assert that the application-specific title is present to ensure the app loaded successfully.
  // This will fail on error pages (500, 404) which have different titles.
  await expect(page).toHaveTitle('Transformer Lab');
});
