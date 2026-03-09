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
  await expect(page.getByText('Transformer Lab')).toBeVisible({
    timeout: 15000,
  });
}

export async function selectFirstExperiment(page: Page) {
  const dropdown = page.locator('.select-experiment-menu').first();
  await page.locator('.Sidebar button[aria-haspopup="menu"]').first().click();
  await dropdown.waitFor({ state: 'visible', timeout: 10000 });
  const firstExperiment = dropdown.getByRole('menuitem').first();
  await firstExperiment.click();
  await expect(page.getByRole('button', { name: 'Interact' })).toBeEnabled({
    timeout: 5000,
  });
}
