import execa from 'execa';
import Conf from 'conf';
import fs from 'fs';
import path from 'path';

export const config = new Conf<LabState>({
  projectName: 'transformerlab',
  defaults: {
    access_token: undefined,
    user_email: undefined,
    team_id: undefined,
    target: undefined,
  },
});

const storedTarget = config.get('target');
const envTarget = process.env.TL_ENV;

export const IS_LOCAL =
  storedTarget === 'local' || envTarget?.toLowerCase() === 'local';

export const DOMAIN_PROD = 'lab.cloud';
export const DOMAIN_LOCAL = 'localhost';
export const PORT_LOCAL = '8338';

export const WEB_URL = 'http://alpha.lab.cloud:8338/';
export const API_URL = 'http://alpha.lab.cloud:8338/';

// --- State Management ---
interface LabState {
  access_token?: string;
  refresh_token?: string;
  user_email?: string;
  team_id?: string;
  team_name?: string;
  target?: 'local' | 'cloud'; // Added this field
}

interface LabState {
  access_token?: string;
  user_email?: string;
  team_id?: string;
  team_name?: string;
  target?: 'local' | 'cloud';
}

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

export const loadLabConfig = (dir: string = '.'): LabConfig | null => {
  const searchOrder = ['task.json', 'lab.json', 'index.json'];
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

const IS_DEBUG_MODE = false;

/**
 * Logs a message only if IS_DEBUG_MODE is true.
 * @param {...any} args - The arguments to pass to console.log
 */
export function debugLog(...args: unknown[]) {
  if (IS_DEBUG_MODE) {
    console.log('DEBUG:', ...args);
  }
}
