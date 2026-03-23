import { expect, Page } from '@playwright/test';

/**
 * Shared Playwright helpers for E2E tests.
 *
 * Import these in every spec that needs authentication or experiment selection
 * instead of duplicating the logic.
 */

export async function login(page: Page) {
  await page.goto('/');

  // Fresh installs show a first-user bootstrap form instead of seeded admin credentials.
  const createFirstUserButton = page.getByRole('button', {
    name: 'Create First User',
  });
  if ((await createFirstUserButton.count()) > 0) {
    await page.getByPlaceholder('First Name').fill('Admin');
    await page.getByPlaceholder('Last Name').fill('User');
    await page.getByPlaceholder('Email Address').fill('admin@example.com');
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill('admin123');
    await page.getByPlaceholder('Confirm Password').fill('admin123');
    await createFirstUserButton.click();
    await expect(page.locator('.Sidebar')).toBeVisible({
      timeout: 15000,
    });
    return;
  }

  try {
    const setupStatusRes = await page.request.get('/auth/setup/status');
    if (setupStatusRes.ok()) {
      const setupData = await setupStatusRes.json();
      if (setupData && setupData.has_users === false) {
        await page.getByPlaceholder('First Name').fill('Admin');
        await page.getByPlaceholder('Last Name').fill('User');
        await page.getByPlaceholder('Email Address').fill('admin@example.com');
        await page
          .getByRole('textbox', { name: 'Password', exact: true })
          .fill('admin123');
        await page.getByPlaceholder('Confirm Password').fill('admin123');
        await page.getByRole('button', { name: 'Create First User' }).click();
        await expect(page.locator('.Sidebar')).toBeVisible({
          timeout: 15000,
        });
        return;
      }
    }
  } catch {
    // Fall back to the normal login flow below.
  }

  // If setup status check failed or returned stale data, trust the visible UI.
  if ((await createFirstUserButton.count()) > 0) {
    await page.getByPlaceholder('First Name').fill('Admin');
    await page.getByPlaceholder('Last Name').fill('User');
    await page.getByPlaceholder('Email Address').fill('admin@example.com');
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill('admin123');
    await page.getByPlaceholder('Confirm Password').fill('admin123');
    await createFirstUserButton.click();
    await expect(page.locator('.Sidebar')).toBeVisible({
      timeout: 15000,
    });
    return;
  }

  await page.getByPlaceholder('Email Address').fill('admin@example.com');
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('admin123');
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
  const dropdown = page.locator('.select-experiment-menu:visible').first();
  await dropdown.waitFor({ state: 'visible', timeout: 10000 });

  // Wait until the loading sentinel is gone before counting items.
  const loadingItem = dropdown.getByRole('menuitem', { name: 'Loading...' });
  if ((await loadingItem.count()) > 0) {
    await expect(loadingItem).toBeHidden({ timeout: 10000 });
  }

  // Existing experiments are every menuitem except "New".
  const experimentItems = dropdown
    .getByRole('menuitem')
    .filter({ hasNotText: /^New$/ });

  if ((await experimentItems.count()) > 0) {
    await experimentItems.first().click();
  } else {
    // Fresh installs can start with zero experiments; create one on demand.
    await dropdown.getByRole('menuitem', { name: 'New' }).click();
    const newExperimentDialog = page.getByRole('dialog', {
      name: 'New Experiment',
    });
    await expect(newExperimentDialog).toBeVisible({ timeout: 10000 });
    await newExperimentDialog
      .getByPlaceholder('Experiment Name')
      .fill(`smoke-${Date.now()}`);
    await newExperimentDialog.getByRole('button', { name: 'Create' }).click();
  }

  // Wait for dropdown to close and menu trigger to no longer say "Select"
  await expect(dropdown).toBeHidden({ timeout: 10000 });
  await expect(menuTrigger).not.toHaveText(/^Select\s*$/, { timeout: 15000 });
}
