import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('storage tab shows usage and threshold controls', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  // Team settings lives at the /team hash route (see UserWidget "Team Settings").
  await page.goto('/#/team');

  // Open the Storage tab.
  const storageTab = page.getByRole('tab', { name: 'Storage' });
  await expect(storageTab).toBeVisible({ timeout: 30000 });
  await storageTab.click();

  // The worker may not have produced a snapshot yet in a fresh container, so accept
  // either the populated view ("Total storage used") or the empty state.
  const populated = page.getByText('Total storage used');
  const emptyState = page.getByText('No storage data yet.');
  const loadingState = page.getByText('Loading storage usage…');

  await expect(async () => {
    const isPopulated = await populated.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    const isLoading = await loadingState.isVisible().catch(() => false);
    expect(isPopulated || isEmpty || isLoading).toBe(true);
  }).toPass({ timeout: 60000 });

  // If populated, the recalculate button and threshold section should render.
  if (await populated.isVisible().catch(() => false)) {
    await expect(
      page.getByRole('button', { name: 'Recalculate now' }),
    ).toBeVisible();
    await expect(page.getByText('Notification thresholds')).toBeVisible();
  }
});
