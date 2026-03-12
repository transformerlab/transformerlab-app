import { test, expect } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

/**
 * End-to-end test: create a blank task, run "echo hello" on the local provider,
 * and verify the output appears in the Machine Logs.
 */

test.describe('Hello World Task', () => {
  test.setTimeout(120_000);

  test('create blank task, run on local provider, verify output in Machine Logs', async ({
    page,
  }) => {
    await login(page);

    // ── Step 1: Verify a local provider is available via the Compute page ──
    const computeBtn = page.getByRole('button', { name: 'Compute' });
    if ((await computeBtn.count()) > 0) {
      await computeBtn.click();
      // Wait for the Compute page to fully load (Resources tab visible)
      await expect(page.getByRole('tab', { name: 'Resources' })).toBeVisible({
        timeout: 15000,
      });
      // Give the provider list time to populate, then check for Local Machine
      await page.waitForTimeout(5000);
    }

    // ── Step 2: Select an experiment and navigate to Tasks ──
    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 10000,
    });

    // ── Step 3: Create a blank task ──
    await page.getByRole('button', { name: 'New' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Add New Task' }),
    ).toBeVisible();

    // Select "Start with a blank task template"
    await page
      .getByRole('radio', { name: 'Start with a blank task template' })
      .click();
    await page
      .getByRole('dialog', { name: 'Add New Task' })
      .getByRole('button', { name: 'Submit' })
      .click();

    // A YAML editor dialog opens – save the default template
    await expect(page.getByRole('dialog', { name: 'task.yaml' })).toBeVisible({
      timeout: 10000,
    });
    await page
      .getByRole('dialog', { name: 'task.yaml' })
      .getByRole('button', { name: 'Save' })
      .click();

    // Wait for the task template to appear in the list
    await expect(
      page.getByText('my-task', { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 });

    // ── Step 4: Queue the task on the local provider ──
    await page.getByRole('button', { name: 'Queue' }).first().click();
    const queueDialog = page.getByRole('dialog', {
      name: /Queue Task/,
    });
    await expect(queueDialog).toBeVisible({ timeout: 10000 });

    // Ensure "Local" provider is selected (it should be by default)
    await expect(
      queueDialog.getByRole('combobox', { name: 'Compute Provider' }),
    ).toHaveText('Local', { timeout: 5000 });

    // Click Submit to queue the job
    await queueDialog.getByRole('button', { name: 'Submit' }).click();

    // ── Step 5: Wait for the job to complete ──
    // Use first() in case prior runs left completed jobs visible
    await expect(page.getByText('COMPLETE').first()).toBeVisible({
      timeout: 60000,
    });

    // ── Step 6: Open the Output modal and verify "hello" in Machine Logs ──
    await page.getByRole('button', { name: 'Output' }).first().click();

    const outputDialog = page.getByRole('dialog');
    await expect(outputDialog).toBeVisible({ timeout: 10000 });

    // Verify both tabs are present
    await expect(
      outputDialog.getByRole('tab', { name: 'Lab SDK Output' }),
    ).toBeVisible();
    await expect(
      outputDialog.getByRole('tab', { name: 'Machine Logs' }),
    ).toBeVisible();

    // Switch to Machine Logs tab
    await outputDialog
      .getByRole('tab', { name: 'Machine Logs' })
      .click();

    // The Machine Logs are rendered in an xterm.js terminal, so text isn't
    // directly available in the DOM. Verify the content by calling the
    // provider_logs API directly and checking for "hello".
    const experimentName = await page
      .locator('.Sidebar button[aria-haspopup="menu"]')
      .first()
      .textContent();

    // Extract the experiment ID and job ID from the API
    // We can get the job ID from the dialog title ("Output from job: <id>")
    const dialogTitle = await outputDialog
      .locator('text=Output from job:')
      .textContent();
    const jobId = dialogTitle?.match(/Output from job:\s*(\d+)/)?.[1];
    expect(jobId).toBeTruthy();

    // Poll the provider logs API until "hello" appears.
    // The experiment name is "alpha" (from the first experiment).
    // The API is served directly from the base URL (no /api/ prefix).
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
          message: 'Expected "hello" to appear in the Machine Logs',
          timeout: 30000,
          intervals: [2000],
        },
      )
      .toContain('hello');
  });
});
