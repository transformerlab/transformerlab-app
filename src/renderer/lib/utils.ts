/* eslint-disable import/prefer-default-export */

/**
 * Give this function a number of bytes and it will return a human readable string
 * @param bytes number of Bytes
 * @param decimals decimals to show in output
 * @returns string with human readable bytes
 */
export function formatBytes(bytes: number, decimals = 2): string {
  // Handle invalid inputs (NaN, undefined, null, negative values)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    'Bytes',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
    'EiB',
    'ZiB',
    'YiB',
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

function capFirst(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function generateFriendlyName() {
  const adjectives = [
    'adorable',
    'beautiful',
    'brilliant',
    'charming',
    'cheerful',
    'clean',
    'confident',
    'dazzling',
    'elegant',
    'fancy',
    'friendly',
    'glamorous',
    'graceful',
    'handsome',
    'happy',
    'inspiring',
    'kind',
    'lively',
    'lovely',
    'magnificent',
    'marvelous',
    'optimistic',
    'peaceful',
    'playful',
    'radiant',
    'sparkling',
    'splendid',
    'strong',
    'stunning',
    'thoughtful',
    'uplifting',
    'vibrant',
    'victorious',
    'warm',
    'wonderful',
    'zesty',
  ];
  const animals = [
    'aardvark',
    'alligator',
    'alpaca',
    'antelope',
    'baboon',
    'badger',
    'bat',
    'bear',
    'beaver',
    'buffalo',
    'camel',
    'cheetah',
    'chimpanzee',
    'chinchilla',
    'chipmunk',
    'cougar',
    'cow',
    'coyote',
    'crocodile',
    'crow',
    'deer',
    'dingo',
    'dog',
    'donkey',
    'elephant',
    'elk',
    'ferret',
    'fox',
    'frog',
    'gazelle',
    'giraffe',
    'gopher',
    'grizzly',
    'hedgehog',
    'hippopotamus',
    'hyena',
    'ibex',
    'iguana',
    'impala',
    'jackal',
    'jaguar',
    'kangaroo',
    'koala',
    'lemur',
    'leopard',
    'lion',
    'llama',
    'lynx',
    'meerkat',
    'mink',
    'monkey',
    'moose',
    'narwhal',
    'nyala',
    'ocelot',
    'opossum',
    'otter',
    'ox',
    'panda',
    'panther',
    'porcupine',
    'puma',
    'rabbit',
    'raccoon',
    'ram',
  ];

  const name =
    capFirst(adjectives[Math.floor(Math.random() * adjectives.length)]) +
    capFirst(animals[Math.floor(Math.random() * animals.length)]);
  return name;
}

export function jobChipColor(status: string): string {
  if (status === 'COMPLETE') return 'var(--joy-palette-success-200)';
  if (status === 'QUEUED') return 'var(--joy-palette-warning-200)';
  if (status === 'LAUNCHING') return 'var(--joy-palette-primary-200)';
  if (status === 'FAILED') return 'var(--joy-palette-danger-200)';
  if (status === 'STOPPING') return 'var(--joy-palette-warning-200)';
  if (status == 'STOPPED') return 'var(--joy-palette-warning-200)';
  if (status == 'RUNNING') return 'rgb(225,237,233)';

  return 'var(--joy-palette-neutral-200)';
}

/** Matches `lab.job_status.TERMINAL_STATUSES` — safe to remove a job record from the UI. */
const TERMINAL_JOB_STATUSES = new Set([
  'COMPLETE',
  'STOPPED',
  'FAILED',
  'CANCELLED',
  'DELETED',
  'UNAUTHORIZED',
]);

export function isTerminalJobStatus(
  status: string | undefined | null,
): boolean {
  if (status == null || status === '') {
    return false;
  }
  return TERMINAL_JOB_STATUSES.has(status);
}

/** Jobs the user may remove from the experiment list: terminal, or queued but never dispatched. */
export function isDeletableJobRecordStatus(
  status: string | undefined | null,
): boolean {
  if (status == null || status === '') {
    return false;
  }
  return isTerminalJobStatus(status) || status === 'NOT_STARTED';
}

/** UI-only helper: treat explicit STOPPING and optimistic stop requests the same. */
export function isJobStopPending(
  status: string | undefined | null,
  stopRequested?: boolean,
): boolean {
  return status === 'STOPPING' || Boolean(stopRequested);
}

export const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'log',
  'csv',
  'py',
  'yaml',
  'yml',
  'md',
  'sh',
  'cfg',
  'ini',
  'toml',
  'json',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'tsx',
  'jsx',
  'sql',
  'r',
  'ipynb',
]);

export const IMAGE_FILE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'svg',
]);

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

const EXTENSION_TO_MONACO_LANGUAGE: Record<string, string> = {
  py: 'python',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  sh: 'shell',
  md: 'markdown',
  html: 'html',
  css: 'css',
  xml: 'xml',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  r: 'r',
};

export function getMonacoLanguage(fileName: string): string {
  const ext = getFileExtension(fileName);
  return EXTENSION_TO_MONACO_LANGUAGE[ext] || 'plaintext';
}
