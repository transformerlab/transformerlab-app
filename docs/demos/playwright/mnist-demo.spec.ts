import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Demo script: MNIST Train Task on beta.lab.cloud
 *
 * This script walks through the following flow against beta.lab.cloud:
 *   1. Log in automatically using credentials from .secrets file.
 *   2. Navigate to Tasks → click "New" → click "Upload from your Computer" → dismiss.
 *   3. Go to Tasks Gallery in the sidebar → scroll to MNIST Train Task → Import.
 *   4. Return to Tasks tab, find the imported task, click Queue.
 *   5. Switch provider to "SkypilotNew" → scroll down → Submit.
 *   6. Scroll to Run #43 → click Output → wait for output → dismiss.
 *   7. Click Checkpoints → wait for data → click W&B Tracking → view.
 *
 * Intended for recording as a demo video later.
 */

const BASE_URL = 'https://beta.lab.cloud';

/** Read a key=value from the .secrets file next to this script. */
function loadSecret(key: string): string {
  const secretsPath = path.join(__dirname, '.secrets');
  if (!fs.existsSync(secretsPath)) {
    throw new Error(`Secrets file not found: ${secretsPath}`);
  }
  const content = fs.readFileSync(secretsPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;
    const [k, ...rest] = trimmed.split('=');
    if (k.trim() === key) return rest.join('=').trim();
  }
  throw new Error(`Key "${key}" not found in ${secretsPath}`);
}

test.describe('MNIST Train Task Demo', () => {
  test.setTimeout(600_000); // 10 minutes for a live demo

  test('full MNIST demo walkthrough', async ({ page }) => {
    const adminPassword = loadSecret('ADMIN_PASSWORD_ON_BETA');

    // ── Step 0: Navigate to the app and log in ──────────────────────────
    await page.goto(BASE_URL);

    const sidebar = page.locator('.Sidebar');
    if (!(await sidebar.isVisible())) {
      // Fill login form with credentials from .secrets
      await page.getByPlaceholder('Email Address').fill('admin@example.com');
      await page.getByPlaceholder('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(sidebar).toBeVisible({ timeout: 30_000 });
    }

    // ── Step 1: Wait for an experiment to be loaded ─────────────────────
    // After login, the app auto-selects the last-used experiment (e.g. "alpha").
    // Wait until the experiment button no longer says "Select" — meaning an
    // experiment is loaded and sidebar items like Tasks are enabled.
    const experimentButton = page
      .locator('.Sidebar button[aria-haspopup="menu"]')
      .first();
    await expect(experimentButton).not.toHaveText(/^Select\s*$/, {
      timeout: 30_000,
    });
    // Give the app a moment to finish loading after experiment selection
    await page.waitForTimeout(3000);

    // ── Step 2: Navigate to Tasks and click "New" ───────────────────────
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'New' }).click();

    // The "Add New Task" dialog should appear
    const addTaskDialog = page.getByRole('dialog');
    await expect(addTaskDialog).toBeVisible({ timeout: 30_000 });

    // Click "Upload from your Computer" radio to show the upload UI
    await page
      .getByRole('radio', { name: 'Upload from your Computer' })
      .click();
    await page.waitForTimeout(2000); // Pause to show upload area

    // Dismiss the dialog — ModalClose is a plain <button> child of the dialog
    // It's the first button inside the dialog (before the heading)
    await addTaskDialog.getByRole('button').first().click();
    await expect(addTaskDialog).toBeHidden({ timeout: 30_000 });

    // ── Step 3: Go to Tasks Gallery → find & import MNIST Train Task ────
    await page.getByRole('button', { name: 'Tasks Gallery' }).click();
    await page.waitForTimeout(3000); // Let gallery load

    // Wait for gallery cards to load (cards use paragraphs, not headings)
    await expect(
      page.locator('.OrderTableContainer'),
    ).toBeVisible({ timeout: 30_000 });

    // Find the "MNIST Train Task" card title (rendered as a <p> not a heading)
    const mnistTitle = page
      .locator('p')
      .filter({ hasText: /^MNIST Train Task$/ })
      .first();
    await mnistTitle.scrollIntoViewIfNeeded();
    await expect(mnistTitle).toBeVisible({ timeout: 60_000 });

    // Click the "Import" button inside the same Card ancestor
    const mnistCard = mnistTitle.locator(
      'xpath=ancestor::div[contains(@class, "MuiCard-root")]',
    );
    await mnistCard.getByRole('button', { name: 'Import' }).click();

    // After import the app navigates back to the Tasks tab
    await page.waitForTimeout(5000);

    // Verify the MNIST task appears in the tasks list
    await expect(
      page.getByText('MNIST Train Task').first(),
    ).toBeVisible({ timeout: 60_000 });

    // ── Step 4: Click "Queue" for the MNIST Train Task ──────────────────
    // Find the Queue button in the same row as "MNIST Train Task"
    // The task name and Queue button are siblings in the task row
    await page.getByRole('button', { name: 'Queue' }).first().click();

    const queueDialog = page.getByRole('dialog');
    await expect(queueDialog).toBeVisible({ timeout: 30_000 });

    // ── Step 5: Switch provider to "SkypilotNew", then dismiss ─────────
    // The provider selector is a combobox with label "Compute Provider"
    const providerCombobox = queueDialog.getByRole('combobox', {
      name: 'Compute Provider',
    });
    await providerCombobox.click();

    // Pick "SkypilotNew" from the dropdown options
    const skypilotOption = page.getByRole('option', { name: 'SkypilotNew' });
    await expect(skypilotOption).toBeVisible({ timeout: 30_000 });
    await skypilotOption.click();
    await page.waitForTimeout(1500); // Pause to show the selection

    // Dismiss the queue dialog without submitting
    await queueDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(queueDialog).toBeHidden({ timeout: 30_000 });

    // ── Step 6: Find Run #43, click Output ──────────────────────────────
    await page.waitForTimeout(5000); // Let runs list populate

    // Scroll down to find run #43 — look for the static text "43"
    // followed by "trl-train-task-job-43"
    const run43Text = page.getByText('trl-train-task-job-43');
    await run43Text.scrollIntoViewIfNeeded();
    await expect(run43Text).toBeVisible({ timeout: 60_000 });

    // Click the "Output" button for run #43
    // The Output button is after the run #43 text block
    // We need to find the Output button that's near run 43
    // Run #43 row contains: W&B Tracking, Output, Artifacts, Checkpoints, Files
    const run43Section = run43Text.locator('xpath=ancestor::div[1]');
    const outputButton = run43Section
      .getByRole('button', { name: 'Output' })
      .first();

    // If the Output button is not in the immediate parent, fall back
    // to finding the Output button that follows the "43" text
    if ((await outputButton.count()) === 0) {
      // Fallback: find the run 43 text, then look nearby for Output
      await page
        .locator('text=trl-train-task-job-43')
        .first()
        .locator('xpath=following::button[contains(., "Output")]')
        .first()
        .click();
    } else {
      await outputButton.click();
    }

    // Wait for the Output dialog to appear and content to load
    const outputDialog = page.getByRole('dialog');
    await expect(outputDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);

    // Dismiss the output dialog — first button is the ModalClose
    await outputDialog.getByRole('button').first().click();
    await expect(outputDialog).toBeHidden({ timeout: 30_000 });

    // ── Step 7: Click Checkpoints ───────────────────────────────────────
    // Re-scroll to run #43 area and click Checkpoints
    const run43TextAgain = page.getByText('trl-train-task-job-43');
    await run43TextAgain.scrollIntoViewIfNeeded();

    const run43SectionAgain = run43TextAgain.locator('xpath=ancestor::div[1]');
    const checkpointsBtn = run43SectionAgain
      .getByRole('button', { name: 'Checkpoints' })
      .first();

    if ((await checkpointsBtn.count()) === 0) {
      await page
        .locator('text=trl-train-task-job-43')
        .first()
        .locator('xpath=following::button[contains(., "Checkpoints")]')
        .first()
        .click();
    } else {
      await checkpointsBtn.click();
    }

    // Wait for checkpoints dialog to load
    const checkpointsDialog = page.getByRole('dialog');
    await expect(checkpointsDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);

    // Dismiss checkpoints
    await checkpointsDialog.getByRole('button').first().click();
    await expect(checkpointsDialog).toBeHidden({ timeout: 30_000 });

    // ── Step 8: Click W&B Tracking ──────────────────────────────────────
    const run43TextWandb = page.getByText('trl-train-task-job-43');
    await run43TextWandb.scrollIntoViewIfNeeded();

    const run43SectionWandb = run43TextWandb.locator('xpath=ancestor::div[1]');
    const wandbBtn = run43SectionWandb
      .getByRole('button', { name: 'W&B Tracking' })
      .first();

    if ((await wandbBtn.count()) === 0) {
      await page
        .locator('text=trl-train-task-job-43')
        .first()
        .locator('xpath=following::button[contains(., "W&B Tracking")]')
        .first()
        .click();
    } else {
      await wandbBtn.click();
    }

    // Wait for W&B panel to load
    await page.waitForTimeout(5000);

    console.log('Demo walkthrough complete!');
  });
});
