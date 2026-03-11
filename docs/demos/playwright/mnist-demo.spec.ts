import { test, expect, type Page, type Locator } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface NarrationStep {
  text: string;
  durationMs: number;
}

const USE_APPLE_SPEECH = process.env.APPLE_SPEECH === '1';

const NARRATION_BUFFER_MS = 3000;

/** Parse the voiceover script markdown into a map of step name → narration. */
function loadNarration(): Map<string, NarrationStep> {
  const scriptPath = path.join(__dirname, 'mnist-demo-script.md');
  const content = fs.readFileSync(scriptPath, 'utf-8');
  const steps = new Map<string, NarrationStep>();
  let currentStep: string | null = null;
  let currentDuration = 0;
  let currentLines: string[] = [];

  for (const line of content.split('\n')) {
    const heading = line.match(/^## (Step \d+)\s.*\[(\d+)s\]/);
    if (heading) {
      if (currentStep) {
        steps.set(currentStep, {
          text: currentLines.join('\n').trim(),
          durationMs: currentDuration * 1000 + NARRATION_BUFFER_MS,
        });
      }
      currentStep = heading[1];
      currentDuration = parseInt(heading[2], 10);
      currentLines = [];
    } else if (currentStep) {
      currentLines.push(line);
    }
  }
  if (currentStep) {
    steps.set(currentStep, {
      text: currentLines.join('\n').trim(),
      durationMs: currentDuration * 1000 + NARRATION_BUFFER_MS,
    });
  }
  return steps;
}

/** Print a narration step to the terminal and pause for the speaking duration.
 *  When APPLE_SPEECH=1, uses macOS `say` for text-to-speech (blocks until done). */
async function narrate(
  page: Page,
  narration: Map<string, NarrationStep>,
  step: string,
): Promise<void> {
  const entry = narration.get(step);
  if (!entry) return;
  const divider = '─'.repeat(60);
  console.log(`\n${divider}`);
  console.log(`🎬  ${step}  (${Math.round(entry.durationMs / 1000)}s)`);
  console.log(divider);
  console.log(entry.text);
  console.log(divider + '\n');

  if (USE_APPLE_SPEECH) {
    // `say` blocks until speech finishes, so no timed pause needed
    const escaped = entry.text.replace(/'/g, "'\\''");
    execSync(`say -v Samantha '${escaped}'`);
  } else {
    await page.waitForTimeout(entry.durationMs);
  }
}

/** Smoothly scroll an element into view so the demo doesn't jump. */
async function smoothScrollTo(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle();
  if (handle) {
    // Scroll in small increments for a slower, cinematic scroll
    await handle.evaluate((el) => {
      const target = el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2;
      const start = window.scrollY;
      const distance = target - start;
      const duration = Math.min(Math.abs(distance) * 3, 3000); // up to 3s
      let startTime: number | null = null;
      function step(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const ease = progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress;
        window.scrollTo(0, start + distance * ease);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    // Wait for the slow scroll animation to finish
    await page.waitForTimeout(3500);
  }
}

const TRANSITION_PAUSE = 4000;

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
    const script = loadNarration();

    // ── Log in before narration starts (avoid blank screen) ────────────
    await page.goto(BASE_URL);

    const sidebar = page.locator('.Sidebar');
    if (!(await sidebar.isVisible())) {
      await page.getByPlaceholder('Email Address').fill('admin@example.com');
      await page.getByPlaceholder('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(sidebar).toBeVisible({ timeout: 30_000 });
    }

    // ── Step 0: Welcome ─────────────────────────────────────────────────
    await narrate(page, script, 'Step 0');

    // ── Step 1: Wait for an experiment to be loaded ─────────────────────
    await narrate(page, script, 'Step 1');
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
    await narrate(page, script, 'Step 2');
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(TRANSITION_PAUSE);

    await page.getByRole('button', { name: 'New' }).click();

    // The "Add New Task" dialog should appear
    const addTaskDialog = page.getByRole('dialog');
    await expect(addTaskDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Click "Upload from your Computer" radio to show the upload UI
    await page
      .getByRole('radio', { name: 'Upload from your Computer' })
      .click();
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Dismiss the dialog — ModalClose is a plain <button> child of the dialog
    // It's the first button inside the dialog (before the heading)
    await addTaskDialog.getByRole('button').first().click();
    await expect(addTaskDialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 3: Go to Tasks Gallery → find & import MNIST Train Task ────
    await narrate(page, script, 'Step 3');
    await page.getByRole('button', { name: 'Tasks Gallery' }).click();
    await page.waitForTimeout(3000); // Let gallery load

    // Wait for gallery cards to load (cards use paragraphs, not headings)
    await expect(
      page.locator('.OrderTableContainer'),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Find the "MNIST Train Task" card title (rendered as a <p> not a heading)
    const mnistTitle = page
      .locator('p')
      .filter({ hasText: /^MNIST Train Task$/ })
      .first();
    await smoothScrollTo(page, mnistTitle);
    await expect(mnistTitle).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Click the "Import" button inside the same Card ancestor
    const mnistCard = mnistTitle.locator(
      'xpath=ancestor::div[contains(@class, "MuiCard-root")]',
    );
    await mnistCard.getByRole('button', { name: 'Import' }).click();
    await page.waitForTimeout(TRANSITION_PAUSE);

    // After import the app navigates back to the Tasks tab
    await page.waitForTimeout(5000);

    // Verify the MNIST task appears in the tasks list
    await expect(
      page.getByText('MNIST Train Task').first(),
    ).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 4: Click "Queue" for the MNIST Train Task ──────────────────
    await narrate(page, script, 'Step 4');
    // Find the Queue button in the same row as "MNIST Train Task"
    // The task name and Queue button are siblings in the task row
    await page.getByRole('button', { name: 'Queue' }).first().click();

    const queueDialog = page.getByRole('dialog');
    await expect(queueDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 5: Switch provider to "SkypilotNew", then dismiss ─────────
    await narrate(page, script, 'Step 5');
    // The provider selector is a combobox with label "Compute Provider"
    const providerCombobox = queueDialog.getByRole('combobox', {
      name: 'Compute Provider',
    });
    await providerCombobox.click();
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Pick "SkypilotNew" from the dropdown options
    const skypilotOption = page.getByRole('option', { name: 'SkypilotNew' });
    await expect(skypilotOption).toBeVisible({ timeout: 30_000 });
    await skypilotOption.click();
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Dismiss the queue dialog without submitting
    await queueDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(queueDialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 6: Find Run #43, click Output ──────────────────────────────
    await narrate(page, script, 'Step 6');
    await page.waitForTimeout(5000); // Let runs list populate

    // Scroll down to find run #43 — look for the static text "43"
    // followed by "trl-train-task-job-43"
    const run43Text = page.getByText('trl-train-task-job-43');
    await smoothScrollTo(page, run43Text);
    await expect(run43Text).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Click the "Output" button for run #43
    // Buttons live in the same <tr> as the job name text
    const run43Row = run43Text.locator('xpath=ancestor::tr');
    await run43Row.getByRole('button', { name: 'Output' }).click();

    // Wait for the Output dialog to appear and content to load
    const outputDialog = page.getByRole('dialog');
    await expect(outputDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Dismiss the output dialog — first button is the ModalClose
    await outputDialog.getByRole('button').first().click();
    await expect(outputDialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 7: Click Checkpoints ───────────────────────────────────────
    await narrate(page, script, 'Step 7');
    // Re-scroll to run #43 area and click Checkpoints
    const run43TextAgain = page.getByText('trl-train-task-job-43');
    await smoothScrollTo(page, run43TextAgain);

    const run43RowAgain = run43TextAgain.locator('xpath=ancestor::tr');
    await run43RowAgain.getByRole('button', { name: 'Checkpoints' }).click();

    // Wait for checkpoints dialog to load
    const checkpointsDialog = page.getByRole('dialog');
    await expect(checkpointsDialog).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    await page.waitForTimeout(TRANSITION_PAUSE);

    // Dismiss checkpoints
    await checkpointsDialog.getByRole('button').first().click();
    await expect(checkpointsDialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(TRANSITION_PAUSE);

    // ── Step 8: Click W&B Tracking ──────────────────────────────────────
    await narrate(page, script, 'Step 8');
    const run43TextWandb = page.getByText('trl-train-task-job-43');
    await smoothScrollTo(page, run43TextWandb);

    const run43RowWandb = run43TextWandb.locator('xpath=ancestor::tr');

    // Set up listener before clicking — W&B Tracking opens a new browser tab
    const wandbPagePromise = page.context().waitForEvent('page');
    await run43RowWandb.getByRole('button', { name: 'W&B Tracking' }).click();

    const wandbPage = await wandbPagePromise;
    await wandbPage.waitForLoadState('domcontentloaded');
    await wandbPage.waitForTimeout(5000);
    await wandbPage.waitForTimeout(TRANSITION_PAUSE);

    // Close the W&B tab and return to the app
    await wandbPage.close();
    await page.bringToFront();
    await page.waitForTimeout(TRANSITION_PAUSE);

    await narrate(page, script, 'Step 9');
  });
});
