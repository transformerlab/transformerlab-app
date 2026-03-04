import { test, expect, Page } from '@playwright/test';

/**
 * Smoke tests: verify that all main screens load without crashing.
 *
 * These tests log in once, then navigate to every top-level screen
 * via the sidebar and assert the page doesn't error out.
 */

async function login(page: Page) {
  await page.goto('/');

  // Fill in credentials and submit
  await page.getByPlaceholder('Email Address').fill('admin@example.com');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for the welcome screen to confirm login succeeded
  await expect(page.getByText('Transformer Lab')).toBeVisible({
    timeout: 15000,
  });
}

async function selectFirstExperiment(page: Page) {
  // Open the experiment dropdown (the MenuButton with "Select" or an experiment name)
  const dropdown = page.locator('.select-experiment-menu').first();

  // Click the experiment selector MenuButton in the sidebar
  await page
    .locator('.Sidebar button[aria-haspopup="menu"]')
    .first()
    .click();

  // Wait for the menu to appear and pick the first experiment MenuItem
  await dropdown.waitFor({ state: 'visible', timeout: 10000 });
  const firstExperiment = dropdown.getByRole('menuitem').first();
  await firstExperiment.click();

  // Wait for sidebar experiment items to become enabled
  await expect(page.getByRole('button', { name: 'Interact' })).toBeEnabled({
    timeout: 5000,
  });
}

test.describe('Smoke: main screen navigation', () => {
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
