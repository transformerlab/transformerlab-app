import { test, expect } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

/**
 * End-to-end test: create an Ollama + Gradio interactive task via the Interact
 * page, launch it on the local provider with the smollm:135m model, and verify
 * the job reaches the INTERACTIVE status.
 */

test.describe('Ollama Gradio Interactive Task', () => {
  test.setTimeout(120_000);

  test('create ollama gradio interactive task, launch on local provider, verify INTERACTIVE status', async ({
    page,
  }) => {
    await login(page);

    // ── Step 1: Select an experiment and navigate to Interact ──
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 10000,
    });

    // ── Step 2: Open the New Interactive Task modal ──
    await page.getByRole('button', { name: 'New' }).click();

    // Step 2a: Provider selection – "Local" should be auto-selected
    const providerDialog = page.getByRole('dialog', {
      name: 'Select Compute Provider',
    });
    await expect(providerDialog).toBeVisible({ timeout: 10000 });
    await expect(
      providerDialog.getByRole('combobox', { name: 'Compute Provider' }),
    ).toHaveText('Local', { timeout: 5000 });

    // Click "Next: Choose Task"
    await providerDialog
      .getByRole('button', { name: 'Next: Choose Task' })
      .click();

    // Step 2b: Gallery – select "Ollama + Gradio"
    const galleryDialog = page.getByRole('dialog', {
      name: 'New Interactive Task',
    });
    await expect(galleryDialog).toBeVisible({ timeout: 10000 });
    await expect(
      galleryDialog.getByText('Ollama + Gradio', { exact: true }),
    ).toBeVisible({
      timeout: 10000,
    });
    await galleryDialog.getByText('Ollama + Gradio', { exact: true }).click();

    // Step 2c: Config – fill in model name
    const configDialog = page.getByRole('dialog', {
      name: 'Configure Task',
    });
    await expect(configDialog).toBeVisible({ timeout: 10000 });
    await configDialog
      .getByRole('textbox', { name: 'Model Name' })
      .fill('smollm:135m');

    // ── Step 3: Launch the task ──
    await configDialog.getByRole('button', { name: 'Launch' }).click();

    // ── Step 4: Verify the job card appears with INTERACTIVE status ──
    await expect(page.getByText('INTERACTIVE').first()).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText('Ollama').first()).toBeVisible({
      timeout: 5000,
    });

    // ── Step 5: Verify job card has Logs button and service finishes launching ──
    await expect(
      page.getByRole('button', { name: 'Logs' }).first(),
    ).toBeVisible({ timeout: 10000 });
    // Wait for "Launching…" to disappear — the button becomes "Interact" once the service is ready
    await expect(page.getByRole('button', { name: 'Launching' })).toBeHidden({
      timeout: 60000,
    });
  });
});
