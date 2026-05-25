import { expect, test } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

test.setTimeout(120_000);

test('public notes share link works for an unauthenticated user', async ({
  page,
  browser,
}) => {
  await login(page);
  await selectFirstExperiment(page);

  await page.getByRole('button', { name: /notes/i }).first().click();

  await page.getByRole('button', { name: /public share link/i }).click();

  const toggle = page.getByRole('switch').first();
  await toggle.check();

  const urlInput = page.locator('input[readonly]').first();
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  const shareUrl = await urlInput.inputValue();
  expect(shareUrl).toContain('/#/public/share/');

  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(shareUrl);

  await expect(anonPage.getByText(/sign in/i)).toHaveCount(0);
  await expect(anonPage.getByText(/Powered by Transformer Lab/i)).toBeVisible({
    timeout: 10_000,
  });

  await toggle.uncheck();

  await anonPage.reload();
  await expect(anonPage.getByText(/no longer active/i)).toBeVisible({
    timeout: 10_000,
  });

  await anonContext.close();
});
