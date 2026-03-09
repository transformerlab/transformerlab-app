import { expect, Page } from '@playwright/test';

/**
 * Shared Playwright helpers for E2E tests.
 *
 * Import these in every spec that needs authentication or experiment selection
 * instead of duplicating the logic.
 */

export async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Email Address').fill('admin@example.com');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('.Sidebar')).toBeVisible({
    timeout: 15000,
  });
}

export async function selectFirstExperiment(page: Page) {
  const menuTrigger = page
    .locator('.Sidebar button[aria-haspopup="menu"]')
    .first();
  await menuTrigger.click();
  const dropdown = page.locator('.select-experiment-menu').first();
  await dropdown.waitFor({ state: 'visible', timeout: 10000 });
  // Wait for experiments to load — skip "Loading..." and the "New" item at the end
  // by waiting for a menuitem that is NOT "Loading..." and NOT "New"
  const experimentItem = dropdown
    .getByRole('menuitem')
    .filter({ hasNotText: /^(Loading\.\.\.|New)$/ })
    .first();
  await expect(experimentItem).toBeVisible({ timeout: 10000 });
  await experimentItem.click();
  // Wait for dropdown to close and menu trigger to no longer say "Select"
  await expect(dropdown).toBeHidden({ timeout: 10000 });
  await expect(menuTrigger).not.toHaveText(/^Select\s*$/, { timeout: 15000 });
}
