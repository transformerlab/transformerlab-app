import execa from 'execa';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEBUG = process.env.DEBUG === 'true';
export const HOME_DIR = os.homedir();
export const LAB_DIR = path.join(HOME_DIR, '.lab');
export const CREDENTIALS_PATH = path.join(LAB_DIR, 'credentials');
export const CONFIG_PATH = path.join(LAB_DIR, 'config.json');
export const API_URL = getConfig()?.server || 'http://alpha.lab.cloud:8338';

export interface LabConfig {
  name?: string;
  description?: string;
  config?: {
    cluster_name?: string;
    command?: string;
    setup?: string;
    cpus?: number | string;
    memory?: number | string;
    gpu_count?: number | string;
    disk_space?: number | string;
    accelerators?: string;
  };
  parameters?: Record<
    string,
    {
      type: string;
      default: any;
      description?: string;
      enum?: any[];
    }
  >;
}

export const getJsonFile = (filePath: string) => {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
};

export const getJsonFiles = (dir: string) => {
  try {
    const fullPath = path.resolve(process.cwd(), dir);
    const files = fs.readdirSync(fullPath);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ name: f, path: path.join(fullPath, f) }));
  } catch (e) {
    return [];
  }
};

export function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const config = JSON.parse(content);
      return config;
    }
  } catch (e) {
    debugLog('Failed to read server config:', e);
  }
  return {};
}

export function saveConfig(newConfig: any) {
  try {
    let existingConfig = {};
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      } catch (e) {
        debugLog('Ignoring corrupt config file');
      }
    }

    const mergedConfig = {
      ...existingConfig,
      ...newConfig,
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save server config:', e);
    return false;
  }
}

export const loadTaskConfig = (dir: string = '.'): LabConfig | null => {
  const searchOrder = ['task.json'];
  const absoluteDir = path.resolve(process.cwd(), dir);

  for (const file of searchOrder) {
    const filePath = path.join(absoluteDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.error(`Failed to parse ${file}`);
      }
    }
  }
  return null;
};

export const getGitContext = async (cwd: string = '.') => {
  const execPath = path.resolve(process.cwd(), cwd);

  const runGit = async (args: string[]) => {
    try {
      const { stdout } = await execa('git', args, { cwd: execPath });
      return stdout.trim();
    } catch (e) {
      return '';
    }
  };

  const isGit =
    (await runGit(['rev-parse', '--is-inside-work-tree'])) === 'true';

  if (!isGit) {
    return {
      repo: '',
      branch: '',
      sha: '',
      dirty: false,
      dir: '.',
      mock: true,
    };
  }

  const repo = await runGit(['config', '--get', 'remote.origin.url']);

  let branch = await runGit(['branch', '--show-current']);
  if (!branch) branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);

  const sha = await runGit(['rev-parse', 'HEAD']);
  const status = await runGit(['status', '--porcelain']);

  let dir = await runGit(['rev-parse', '--show-prefix']);
  dir = dir.replace(/\/$/, '') || '.';

  return {
    repo,
    branch: branch || 'HEAD',
    sha: sha || 'unknown',
    dirty: status.length > 0,
    dir,
    mock: false,
  };
};

/**
 * Logs a message only if IS_DEBUG_MODE is true.
 * @param {...any} args - The arguments to pass to console.log
 */
export function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log('DEBUG:', ...args);
  }
}

/**
 * Retrieves user credentials from a local file and checks for the presence of an API key.
 *
 * @returns An object containing:
 * - `hasToken` (boolean): Indicates whether an API key was found in the credentials file.
 * - `email` (string | null): Reserved for future use, currently always returns `null`.
 *
 * The function attempts to read a credentials file located at `~/.lab/credentials`.
 * If the file exists and contains an `api_key`, it sets `hasToken` to `true`.
 * Debug logs are generated to indicate the presence or absence of the API key,
 * or if the credentials file is missing.
 *
 * In case of an error while reading the file, the function logs the error and
 * returns default values (`hasToken: false, email: null`).
 */
export function getCredentials(): { hasAPIKey: boolean; email: string | null } {
  try {
    const credsPath = path.join(os.homedir(), '.lab', 'credentials');

    let hasAPIKey = false;
    let email = null;

    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      if (creds.api_key) hasAPIKey = true;
      if (hasAPIKey) {
        debugLog('Found API key in credentials.');
      } else {
        debugLog('No API key found in credentials.');
      }
    } else {
      debugLog('No credentials file found.');
    }
    return { hasAPIKey: hasAPIKey, email };
  } catch (e) {
    debugLog('Error reading local credentials file:', e);
    return { hasAPIKey: false, email: null };
  }
}
