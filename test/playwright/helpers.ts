import { expect, Page } from '@playwright/test';

/**
 * Shared Playwright helpers for E2E tests.
 *
 * Import these in every spec that needs authentication or experiment selection
 * instead of duplicating the logic.
 */

async function signInWithAdmin(page: Page) {
  await page.getByPlaceholder('Email Address').fill('admin@example.com');
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('.Sidebar')).toBeVisible({
    timeout: 15000,
  });
}

async function completeFirstUserSetupIfVisible(page: Page) {
  const createFirstUserButton = page.getByRole('button', {
    name: 'Create First User',
  });
  if ((await createFirstUserButton.count()) === 0) {
    return false;
  }

  await page.getByPlaceholder('First Name').fill('Admin');
  await page.getByPlaceholder('Last Name').fill('User');
  await page.getByPlaceholder('Email Address').fill('admin@example.com');
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('admin123');
  await page.getByPlaceholder('Confirm Password').fill('admin123');
  await createFirstUserButton.click();

  try {
    await expect(page.locator('.Sidebar')).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    // Parallel workers can race on bootstrap; if another worker created the user,
    // the app switches to Sign In and we should continue with normal login.
  }

  if ((await page.getByRole('button', { name: 'Sign In' }).count()) > 0) {
    await signInWithAdmin(page);
    return true;
  }

  return false;
}

export async function login(page: Page) {
  await page.goto('/');

  // Prefer direct UI detection first for fresh installs.
  if (await completeFirstUserSetupIfVisible(page)) {
    return;
  }

  try {
    const setupStatusRes = await page.request.get('/auth/setup/status');
    if (setupStatusRes.ok()) {
      const setupData = await setupStatusRes.json();
      if (setupData && setupData.has_users === false) {
        await completeFirstUserSetupIfVisible(page);
        return;
      }
    }
  } catch {
    // Fall back to the normal login flow below.
  }

  // Setup status can be stale; re-check visible UI once more before sign in.
  if (await completeFirstUserSetupIfVisible(page)) {
    return;
  }

  await signInWithAdmin(page);
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
    const experimentNameInput = page.getByPlaceholder('Experiment Name');
    await expect(experimentNameInput).toBeVisible({ timeout: 10000 });
    await experimentNameInput.fill(`smoke-${Date.now()}`);
    await page.getByRole('button', { name: 'Create' }).click();
  }

  // Wait for dropdown to close and menu trigger to no longer say "Select"
  await expect(dropdown).toBeHidden({ timeout: 10000 });
  await expect(menuTrigger).not.toHaveText(/^Select\s*$/, { timeout: 15000 });
}
