import { test, expect, Page } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

const GITHUB_REPO_URL =
  'https://github.com/transformerlab/transformerlab-examples';
const GITHUB_SUBDIR =
  'api/transformerlab/galleries/examples/demo-generate-task';

async function replaceTaskNameInMonaco(page: Page, taskName: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click({ force: true });

  const updatedViaMonacoApi = await page.evaluate((nextTaskName) => {
    const maybeMonaco = (window as any).monaco;
    const models = maybeMonaco?.editor?.getModels?.();
    if (!Array.isArray(models) || models.length === 0) {
      return false;
    }
    const model = models[0];
    const current = model.getValue();
    const replaced = /^name:\s*.*$/m.test(current)
      ? current.replace(/^name:\s*.*$/m, `name: ${nextTaskName}`)
      : `name: ${nextTaskName}\n${current}`;
    model.setValue(replaced);
    return true;
  }, taskName);

  if (!updatedViaMonacoApi) {
    throw new Error('Monaco API unavailable for task name update');
  }
}

test.describe('Dataset Generation Task From GitHub', () => {
  test.setTimeout(180_000);

  test('create task from GitHub, run local job, and require COMPLETE - 100%', async ({
    page,
  }) => {
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const taskName = `demo-generate-task_${uniqueSuffix}`;

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
    const taskYamlDialog = page.getByRole('dialog', {
      name: /(Edit Task|task\.ya?ml)/i,
    });
    await expect(taskYamlDialog).toBeVisible({ timeout: 15000 });
    await replaceTaskNameInMonaco(page, taskName);
    await taskYamlDialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(taskName, { exact: true }).first()).toBeVisible(
      {
        timeout: 30000,
      },
    );

    const taskRow = page.locator('tr', {
      has: page.getByText(taskName, { exact: true }),
    });
    await taskRow.first().getByRole('button', { name: 'Queue' }).click();

    const queueDialog = page.getByRole('dialog', { name: /Queue Task/ });
    await expect(queueDialog).toBeVisible({ timeout: 10000 });
    await expect(
      queueDialog.getByRole('combobox', { name: 'Compute Provider' }),
    ).toHaveText('Local', { timeout: 5000 });
    await queueDialog.getByRole('button', { name: 'Submit' }).click();
    const jobNamePrefix = `${taskName}-job-`;
    const queuedJobRow = page.locator('tr', {
      has: page.getByRole('button', { name: 'Output' }),
      hasText: jobNamePrefix,
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
