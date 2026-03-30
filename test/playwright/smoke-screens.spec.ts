import { test, expect } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

/**
 * Smoke tests: verify that all main screens load without crashing.
 *
 * These tests log in once, then navigate to every top-level screen
 * via the sidebar and assert the page doesn't error out.
 */

test.describe('Smoke: main screen navigation', () => {
  // This suite mutates shared app state (first-user bootstrap, experiment creation),
  // so it must run serially when local runs use multiple workers.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('welcome screen loads after login', async ({ page }) => {
    await expect(
      page.getByText("Let's start your next Experiment"),
    ).toBeVisible();
  });

  // --- Global sidebar items (always enabled) ---

  test('navigate to Model Registry screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Model Registry' }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  test('navigate to Datasets screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Datasets' }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  // --- Multiuser-only sidebar items ---

  test('navigate to Tasks Gallery screen', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Tasks Gallery' });
    test.skip(
      (await btn.count()) === 0,
      'Tasks Gallery not shown (local mode)',
    );
    await btn.click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  test('navigate to Compute screen', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Compute' });
    test.skip((await btn.count()) === 0, 'Compute not shown (local mode)');
    await btn.click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  // --- Experiment sidebar items (require an experiment to be selected) ---

  test('navigate to Interact screen', async ({ page }) => {
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  test('navigate to Tasks screen', async ({ page }) => {
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  test('navigate to Documents screen', async ({ page }) => {
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });

  test('navigate to Notes screen', async ({ page }) => {
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Notes' }).click();
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('.Sidebar')).toBeVisible();
  });
});
