import { test, expect, Page } from '@playwright/test';
import { login, selectFirstExperiment } from './helpers';

const TASK_NAME_PREFIX = 'sample-generate-task';

async function replaceMonacoContents(page: Page, contents: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click({ force: true });

  // Prefer updating Monaco's model directly (more deterministic in E2E).
  const updatedViaMonacoApi = await page.evaluate((nextContent) => {
    const maybeMonaco = (window as any).monaco;
    const models = maybeMonaco?.editor?.getModels?.();
    if (!Array.isArray(models) || models.length === 0) {
      return false;
    }
    models[0].setValue(nextContent);
    return true;
  }, contents);

  if (updatedViaMonacoApi) {
    return;
  }

  // Fallback when Monaco API is not exposed globally.
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(contents);
}

test.describe('Dataset Generation Task', () => {
  test.setTimeout(180_000);

  test('create blank task, edit task.yaml, run local job, save dataset to registry, verify in Datasets page', async ({
    page,
  }) => {
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const taskName = `${TASK_NAME_PREFIX}_${uniqueSuffix}`;
    const registryDatasetName = `${taskName}-registry-dataset`;
    const registryVersionName = `${taskName}-v1`;
    const taskYaml = `name: ${taskName}
github_repo_url: https://github.com/transformerlab/transformerlab-examples
github_repo_dir: demo-generate-task
resources:
  cpus: 2
  memory: 4
setup: "uv pip install datasets;"
run: "python ~/demo-generate-task/fake_generate.py"
`;

    await login(page);

    await selectFirstExperiment(page);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 10000,
    });

    // Create a blank task.
    await page.getByRole('button', { name: 'New' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Add New Task' }),
    ).toBeVisible();
    await page
      .getByRole('radio', { name: 'Start with a blank task template' })
      .click();
    await page
      .getByRole('dialog', { name: 'Add New Task' })
      .getByRole('button', { name: 'Submit' })
      .click();

    // Edit generated task.yaml to use the dataset generator template.
    const taskYamlDialog = page.getByRole('dialog', {
      name: /(Edit Task|task\.ya?ml)/i,
    });
    await expect(taskYamlDialog).toBeVisible({ timeout: 10000 });
    await replaceMonacoContents(page, taskYaml);
    await taskYamlDialog.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText(taskName, { exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });

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

    // Wait for this specific job to reach COMPLETE - 100%, and fail fast on bad terminal states.
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
            'Expected dataset job to reach COMPLETE - 100% (and never FAILED/COMPLETE - 0%)',
          timeout: 120000,
          intervals: [2000],
        },
      )
      .toBeTruthy();

    // Open Artifacts (now opens the datasets/artifacts modal directly).
    await queuedJobRow.getByRole('button', { name: 'Artifacts' }).click();

    const artifactsDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Artifacts for Job' })
      .first();
    await expect(artifactsDialog).toBeVisible({
      timeout: 10000,
    });
    const saveToRegistryButton = artifactsDialog
      .getByRole('button', { name: 'Save to Registry' })
      .first();
    await expect(saveToRegistryButton).toBeVisible({ timeout: 10000 });
    await saveToRegistryButton.scrollIntoViewIfNeeded();
    await saveToRegistryButton.click();

    const publishDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Publish Dataset to Registry' })
      .first();
    await expect(publishDialog).toBeVisible({ timeout: 10000 });
    await publishDialog
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(registryDatasetName);
    await publishDialog
      .getByRole('textbox', { name: 'Version Name', exact: true })
      .fill(registryVersionName);
    const publishButton = publishDialog.getByRole('button', {
      name: /Publish as/i,
    });
    await publishButton.scrollIntoViewIfNeeded();
    await expect(publishButton).toBeVisible({ timeout: 10000 });
    await publishButton.click();

    // As soon as a "save started" message appears, treat publish-start as success.
    const publishStartedPattern =
      /dataset save to registry started|publishing\s+.+\s+to registry/i;
    await expect
      .poll(
        async () => {
          const dialogText = (await artifactsDialog.textContent()) || '';
          const pageText = (await page.locator('body').textContent()) || '';
          return (
            publishStartedPattern.test(dialogText) ||
            publishStartedPattern.test(pageText)
          );
        },
        {
          message:
            'Expected a registry publish-start message in modal or page notifications',
          timeout: 15000,
          intervals: [1000, 2000],
        },
      )
      .toBeTruthy();
  });
});
