/** Narration steps parsed from the demo script markdown. */
export interface NarrationStep {
  step: string;
  title: string;
  text: string;
  /** Start time in seconds within the video */
  startSec: number;
  /** End time in seconds within the video */
  endSec: number;
}

/** Cursor keyframe — the cursor interpolates between these positions. */
export interface CursorKeyframe {
  /** Time in seconds within the video */
  timeSec: number;
  /** X coordinate on the 1920×1080 viewport */
  x: number;
  /** Y coordinate on the 1920×1080 viewport */
  y: number;
  /** Description of what is being clicked */
  label: string;
}

/**
 * Narration steps with approximate timestamps for the FAST_MODE recording.
 * The video is ~43 seconds long. Timestamps are estimates based on the
 * FAST_MODE pauses in the Playwright spec.
 */
export const narrationSteps: NarrationStep[] = [
  {
    step: 'Step 0',
    title: 'Welcome',
    text: 'Hello and welcome to Transformer Lab! An open-source platform for training, evaluating, and experimenting with machine learning models.',
    startSec: 0,
    endSec: 5,
  },
  {
    step: 'Step 1',
    title: 'Logging In',
    text: 'We start by logging in. Transformer Lab supports team-based access, so each user has their own account.',
    startSec: 5,
    endSec: 9,
  },
  {
    step: 'Step 2',
    title: 'Exploring the Tasks Tab',
    text: 'Let\u2019s navigate to the Tasks tab. Here you can see all tasks in this experiment. Click \u201cNew\u201d to create a task or upload one.',
    startSec: 9,
    endSec: 13,
  },
  {
    step: 'Step 3',
    title: 'Importing from the Tasks Gallery',
    text: 'The built-in Tasks Gallery has ready-to-use tasks. Let\u2019s find the MNIST Train Task and import it.',
    startSec: 13,
    endSec: 21,
  },
  {
    step: 'Step 4',
    title: 'Queueing a Task',
    text: 'Now we can see the MNIST Train Task in our list. Click \u201cQueue\u201d to configure and run it.',
    startSec: 21,
    endSec: 22,
  },
  {
    step: 'Step 5',
    title: 'Choosing a Compute Provider',
    text: 'Select a compute provider \u2014 run locally, on cloud GPUs, or remote clusters. Here we pick \u201cSkypilotNew.\u201d',
    startSec: 22,
    endSec: 24,
  },
  {
    step: 'Step 6',
    title: 'Viewing Job Output',
    text: 'Scrolling to the Jobs section, let\u2019s look at Job #43. Click \u201cOutput\u201d to see training progress and loss values.',
    startSec: 24,
    endSec: 32,
  },
  {
    step: 'Step 7',
    title: 'Reviewing Checkpoints',
    text: 'Transformer Lab saves model checkpoints during training. Use them to resume training or deploy the best model.',
    startSec: 32,
    endSec: 36,
  },
  {
    step: 'Step 8',
    title: 'Weights & Biases Integration',
    text: 'W&B integration provides detailed training metrics, charts, and comparisons across runs.',
    startSec: 36,
    endSec: 40,
  },
  {
    step: 'Step 9',
    title: 'Wrap Up',
    text: 'That\u2019s a quick tour of Transformer Lab! Import tasks, configure providers, and review results \u2014 all from one interface.',
    startSec: 40,
    endSec: 43,
  },
];

/**
 * Cursor keyframes: approximate click positions from the Playwright spec.
 * Coordinates are on the 1920×1080 viewport. The cursor interpolates smoothly
 * between these positions and shows a click animation at each keyframe.
 */
export const cursorKeyframes: CursorKeyframe[] = [
  { timeSec: 2.3, x: 960, y: 610, label: 'Sign In' },
  { timeSec: 9.6, x: 125, y: 296, label: 'Sidebar: Tasks' },
  { timeSec: 10.3, x: 1600, y: 118, label: 'New' },
  { timeSec: 11.1, x: 800, y: 418, label: 'Upload from your Computer' },
  { timeSec: 11.9, x: 1376, y: 186, label: 'Close dialog' },
  { timeSec: 12.7, x: 125, y: 346, label: 'Tasks Gallery' },
  { timeSec: 16.9, x: 1315, y: 620, label: 'Import' },
  { timeSec: 21.1, x: 1490, y: 350, label: 'Queue' },
  { timeSec: 21.9, x: 960, y: 434, label: 'Compute Provider' },
  { timeSec: 22.7, x: 960, y: 520, label: 'SkypilotNew' },
  { timeSec: 23.5, x: 1088, y: 752, label: 'Cancel' },
  { timeSec: 28.6, x: 1405, y: 540, label: 'Output' },
  { timeSec: 31.6, x: 1376, y: 186, label: 'Close Output' },
  { timeSec: 32.8, x: 1515, y: 540, label: 'Checkpoints' },
  { timeSec: 35.0, x: 1376, y: 186, label: 'Close Checkpoints' },
  { timeSec: 36.3, x: 1615, y: 540, label: 'W&B Tracking' },
];
