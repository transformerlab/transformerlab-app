import { test, expect } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

/**
 * End-to-end test: create an Ollama interactive task via the Interact page,
 * launch it on the local provider with the smollm:135m model, and verify
 * the job reaches the INTERACTIVE status.
 */

test.describe('Ollama Interactive Task', () => {
  test.setTimeout(120_000);

  test('create ollama interactive task, launch on local provider, verify INTERACTIVE status', async ({
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

    // Step 2b: Gallery – select "Ollama Server"
    const galleryDialog = page.getByRole('dialog', {
      name: 'New Interactive Task',
    });
    await expect(galleryDialog).toBeVisible({ timeout: 10000 });
    await expect(galleryDialog.getByText('Ollama Server')).toBeVisible({
      timeout: 10000,
    });
    await galleryDialog.getByText('Ollama Server').click();

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
    // The job card should show the Ollama type and reach INTERACTIVE status
    await expect(page.getByText('INTERACTIVE').first()).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText('Ollama').first()).toBeVisible({
      timeout: 5000,
    });

    // ── Step 5: Verify the Connect dialog shows Ollama session info ──
    await page.getByRole('button', { name: 'Connect' }).first().click();
    const connectDialog = page.getByRole('dialog');
    await expect(connectDialog).toBeVisible({ timeout: 10000 });
    await expect(
      connectDialog.getByText('Ollama Server Interactive Session'),
    ).toBeVisible();
    await expect(
      connectDialog.getByText('Access Ollama API Server'),
    ).toBeVisible();

    // ── Step 6: Verify ollama is running via provider logs API ──
    // Extract the job ID from the dialog text
    const jobIdText = await connectDialog
      .locator('text=Job')
      .first()
      .textContent();
    const jobId = jobIdText?.match(/Job\s+(\d+)/)?.[1];
    expect(jobId).toBeTruthy();

    // Poll the provider logs API until "ollama" appears (indicating the service started)
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/experiment/alpha/jobs/${jobId}/provider_logs?tail_lines=400&live=false`,
          );
          if (!response.ok()) return '';
          const data = await response.json();
          return data?.logs ?? '';
        },
        {
          message:
            'Expected "ollama" to appear in the provider logs indicating the service started',
          timeout: 60000,
          intervals: [3000],
        },
      )
      .toContain('ollama');
  });
});
