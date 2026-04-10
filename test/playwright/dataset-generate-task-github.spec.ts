import { test, expect } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

const GITHUB_REPO_URL =
  'https://github.com/transformerlab/transformerlab-examples';
const GITHUB_SUBDIR = 'demo-generate-task';
const TASK_NAME_CANDIDATES = ['sample-generate-task', 'demo-generate-task'];

test.describe('Dataset Generation Task From GitHub', () => {
  test.setTimeout(180_000);

  test('create task from GitHub, run local job, and require COMPLETE - 100%', async ({
    page,
  }) => {
    await login(page);

    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 10000,
    });

    // Create a task from GitHub repo + subdirectory.
    await page.getByRole('button', { name: 'New' }).click();
    const addTaskDialog = page.getByRole('dialog', { name: 'Add New Task' });
    await expect(addTaskDialog).toBeVisible({ timeout: 10000 });
    await addTaskDialog.getByRole('radio', { name: 'From GitHub' }).click();
    await addTaskDialog
      .getByPlaceholder('https://github.com/username/repository.git')
      .fill(GITHUB_REPO_URL);
    await addTaskDialog
      .getByPlaceholder('Optional: subdirectory (e.g. tasks/my-task)')
      .fill(GITHUB_SUBDIR);
    await addTaskDialog.getByRole('button', { name: 'Submit' }).click();
    const taskYamlDialog = page.getByRole('dialog', { name: 'task.yaml' });
    await expect(taskYamlDialog).toBeVisible({ timeout: 15000 });
    await taskYamlDialog.getByRole('button', { name: 'Save' }).click();

    // Wait for the imported task to appear.
    let taskName = '';
    await expect
      .poll(
        async () => {
          for (const candidate of TASK_NAME_CANDIDATES) {
            const row = page.locator('tr', {
              has: page.getByText(candidate, { exact: true }),
            });
            if ((await row.count()) > 0) {
              taskName = candidate;
              break;
            }
          }
          return taskName;
        },
        {
          message: 'Expected imported GitHub task to appear in Tasks list',
          timeout: 30000,
          intervals: [1000, 2000],
        },
      )
      .not.toBe('');

    const taskRow = page.locator('tr', {
      has: page.getByText(taskName, { exact: true }),
    });
    await taskRow.first().getByRole('button', { name: 'Queue' }).click();

    const queueDialog = page.getByRole('dialog', { name: /Queue Task/ });
    await expect(queueDialog).toBeVisible({ timeout: 10000 });
    await expect(
      queueDialog.getByRole('combobox', { name: 'Compute Provider' }),
    ).toHaveText('Local', { timeout: 5000 });
    const jobsWithOutputRows = page.locator('tr', {
      has: page.getByRole('button', { name: 'Output' }),
    });
    const existingJobSignatures = new Set<string>();
    const existingRowCount = await jobsWithOutputRows.count();
    for (let i = 0; i < existingRowCount; i += 1) {
      const signature = (await jobsWithOutputRows
        .nth(i)
        .locator('td')
        .first()
        .innerText())
        .trim();
      if (signature) {
        existingJobSignatures.add(signature);
      }
    }
    await queueDialog.getByRole('button', { name: 'Submit' }).click();

    let queuedJobSignature = '';
    await expect
      .poll(
        async () => {
          const rowCount = await jobsWithOutputRows.count();
          for (let i = 0; i < rowCount; i += 1) {
            const signature = (await jobsWithOutputRows
              .nth(i)
              .locator('td')
              .first()
              .innerText())
              .trim();
            if (signature && !existingJobSignatures.has(signature)) {
              queuedJobSignature = signature;
              break;
            }
          }
          return queuedJobSignature;
        },
        {
          message: 'Expected a newly queued job row to appear',
          timeout: 30000,
          intervals: [1000, 2000],
        },
      )
      .not.toBe('');

    const queuedJobRow = page.locator('tr', {
      has: page.getByRole('button', { name: 'Output' }),
      hasText: queuedJobSignature,
    });

    // Stop once COMPLETE - 100% is reached.
    // Explicitly fail early if FAILED or COMPLETE - 0% is seen.
    await expect
      .poll(
        async () => {
          const rowText = (await queuedJobRow.first().innerText()).replace(
            /\s+/g,
            ' ',
          );

          if (/FAILED/i.test(rowText)) {
            throw new Error(`Job entered failed state: ${rowText}`);
          }
          if (/COMPLETE\s*-\s*0(?:\.0)?%/i.test(rowText)) {
            throw new Error(`Job completed with 0%: ${rowText}`);
          }

          return /COMPLETE\s*-\s*100(?:\.0)?%/i.test(rowText);
        },
        {
          message:
            'Expected job to reach COMPLETE - 100% (and never FAILED/COMPLETE - 0%)',
          timeout: 120000,
          intervals: [2000],
        },
      )
      .toBeTruthy();
  });
});
