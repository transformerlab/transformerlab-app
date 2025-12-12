import { API_URL, config } from './utils';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { getPath, handleError as handleErrorUtil } from './endpoints';

const LAB_DIR = path.join(os.homedir(), '.lab');
const CREDENTIALS_PATH = path.join(LAB_DIR, 'credentials');
const CONFIG_PATH = path.join(LAB_DIR, 'config.json');

function getStoredToken(): string | null {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const data = JSON.parse(content);
      return data.access_token || null;
    }
  } catch (e) {
    // Ignore read errors
  }
  // Fallback to legacy config if needed
  return config.get('access_token') || null;
}

function getStoredTeamId(): string | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(content);
      return data.team_id || null;
    }
  } catch (e) {
    // Ignore
  }
  return config.get('team_id') || null;
}

class TransformerLabAPI {
  private async fetchWithAuth(
    relativePathOrUrl: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = getStoredToken();
    const teamId = getStoredTeamId();

    const headers: HeadersInit = {
      ...(options.headers || {}),
    };

    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }
    if (teamId) {
      (headers as any)['X-Team-Id'] = teamId;
    }

    let url = relativePathOrUrl;
    if (!url.startsWith('http')) {
      const baseUrl = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;
      const pathPart = url.startsWith('/') ? url.slice(1) : url;
      url = `${baseUrl}${pathPart}`;
    }

    const response = await fetch(url, { ...options, headers });
    return response;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let errorData: any = {};
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { message: res.statusText };
      }

      if (res.status === 401) throw new Error('Authentication Required');

      const detail = errorData?.detail || errorData?.info?.detail;
      const message =
        errorData?.message || errorData?.info?.message || 'Unknown Error';

      throw new Error(
        `${message} (${res.status} ${res.url}) ${detail ? ': ' + detail : ''}`,
      );
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  handleError(error: any): { message: string; detail?: string } {
    return handleErrorUtil(error);
  }

  // --- SAFE ENDPOINTS (Try/Catch wrapper around getPath) ---

  private safeGetPath(
    resource: string,
    pathArr: string[],
    params: any,
    fallback: string,
  ): string {
    try {
      return getPath(resource, pathArr, params);
    } catch (e) {
      return fallback;
    }
  }

  // --- AUTH ---

  async verifyToken(token: string) {
    // We do NOT use safeGetPath here because verifyToken usually runs
    // before we have a full environment setup, so we want to be explicit.
    let pathPart = '/users/me/teams';
    try {
      pathPart = getPath('users', ['me', 'teams'], {});
    } catch (e) {}

    const res = await fetch(`${API_URL}${pathPart}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();
    return {
      access_token: token,
      teams: data.teams || [],
      user: { email: 'API User' },
    };
  }

  // --- TASKS ---

  async listTasks() {
    const url = this.safeGetPath('tasks', ['list'], {}, '/tasks/list');
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async getTask(taskId: string) {
    const url = this.safeGetPath(
      'tasks',
      ['get'],
      { id: taskId },
      `/tasks/${taskId}`,
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse<any>(res);
  }

  async createTask(taskId: string, name: string, payload: any) {
    const url = this.safeGetPath('tasks', ['create'], {}, '/tasks/create');
    const urlWithParams = `${url}?id=${encodeURIComponent(taskId)}&name=${encodeURIComponent(name)}`;

    const res = await this.fetchWithAuth(urlWithParams, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await this.handleResponse(res);
  }

  async deleteTask(taskId: string) {
    const url = this.safeGetPath(
      'tasks',
      ['delete'],
      { id: taskId },
      `/tasks/${taskId}`,
    );
    // Assuming DELETE method if fallback is needed, but typically endpoint map handles verb
    // If getPath fails, we might need to guess the verb. usually it's passed in fetchWithAuth options if not standard.
    // For now assuming the backend handles the verb or it's a specific "delete" endpoint string
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async deleteAllTasks() {
    const url = this.safeGetPath(
      'tasks',
      ['delete_all'],
      {},
      '/tasks/delete_all',
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async queueTask(taskId: string, overrides: any = {}) {
    const task = await this.getTask(taskId);

    if (task.type === 'REMOTE' || task.remote_task) {
      // Remote Execution Logic
      let configObj = task.config || {};
      if (typeof configObj === 'string') {
        try {
          configObj = JSON.parse(configObj);
        } catch (e) {}
      }

      const providers = await this.listProviders();
      let providerId = configObj.provider_id;

      if (!providerId && providers && providers.length > 0) {
        providerId = providers[0].id;
      }
      if (!providerId) throw new Error('Task has no Provider set.');

      const provider = providers.find((p: any) => p.id === providerId);
      if (!provider) throw new Error(`Provider ${providerId} not found.`);

      let cmd = configObj.command || '';
      if (overrides && Object.keys(overrides).length > 0) {
        const flags = Object.entries(overrides)
          .map(([k, v]) => `--${k}=${v}`)
          .join(' ');
        cmd = `${cmd} ${flags}`;
      }

      const payload = {
        experiment_id: task.experiment_id || 'global',
        task_name: task.name,
        cluster_name: configObj.cluster_name,
        command: cmd,
        subtype: configObj.subtype,
        cpus: configObj.cpus ? String(configObj.cpus) : '',
        memory: configObj.memory ? String(configObj.memory) : '',
        disk_space: configObj.disk_space ? String(configObj.disk_space) : '',
        accelerators: configObj.accelerators
          ? String(configObj.accelerators)
          : '',
        num_nodes: configObj.num_nodes || 1,
        setup: configObj.setup,
        env_vars: configObj.env_vars || {},
        file_mounts: configObj.file_mounts,
        provider_name: provider.name,
      };

      // Try specialized launch first
      try {
        const launchUrl = this.safeGetPath(
          'compute_provider',
          ['launch'],
          { id: providerId },
          `/compute_provider/${providerId}/launch`,
        );
        const res = await this.fetchWithAuth(launchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await this.handleResponse(res);
      } catch (e: any) {
        // Fallback to generic launch remote
        if (
          e.message &&
          (e.message.includes('404') || e.message.includes('405'))
        ) {
          const fallbackUrl = this.safeGetPath(
            'tasks',
            ['launch_remote'],
            {},
            '/tasks/launch_remote',
          );
          const res = await this.fetchWithAuth(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, provider_id: providerId }),
          });
          return await this.handleResponse(res);
        }
        throw e;
      }
    } else {
      // Local Execution Logic
      const url = this.safeGetPath(
        'tasks',
        ['queue'],
        { id: taskId },
        `/tasks/queue/${taskId}`,
      );
      const params = new URLSearchParams(overrides).toString();
      const fullUrl = params ? `${url}?${params}` : url;

      const res = await this.fetchWithAuth(fullUrl);
      return await this.handleResponse(res);
    }
  }

  // --- PROVIDERS & EXPERIMENTS ---

  async listProviders() {
    const url = this.safeGetPath(
      'compute_provider',
      ['list'],
      {},
      '/compute_provider/list',
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse<any[]>(res);
  }

  async listExperiments() {
    const url = this.safeGetPath(
      'experiment',
      ['list'],
      {},
      '/experiment/list',
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  // --- GALLERY ---

  async getTaskGallery() {
    const url = this.safeGetPath('tasks', ['gallery'], {}, '/tasks/gallery');
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async exportTaskToGallery(taskId: string) {
    const url = this.safeGetPath(
      'tasks',
      ['export_to_gallery'],
      {},
      '/tasks/export_to_gallery',
    );
    const res = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
    return await this.handleResponse(res);
  }

  async installTaskFromGallery(galleryId: string) {
    const url = this.safeGetPath(
      'tasks',
      ['install_from_gallery'],
      {},
      '/tasks/install_from_gallery',
    );
    const res = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gallery_id: galleryId }),
    });
    return await this.handleResponse(res);
  }

  // --- JOBS ---

  async listJobs(experimentId: string = 'global') {
    const url = this.safeGetPath('jobs', ['list'], {}, '/jobs/list');
    const res = await this.fetchWithAuth(`${url}?experimentId=${experimentId}`);
    return await this.handleResponse(res);
  }

  async getJob(id: string) {
    const url = this.safeGetPath('jobs', ['get'], { id }, `/jobs/${id}`);
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async stopJob(id: string) {
    const url = this.safeGetPath('jobs', ['stop'], { id }, `/jobs/stop/${id}`);
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async deleteJob(jobId: string, experimentId: string = 'global') {
    const url = this.safeGetPath(
      'jobs',
      ['delete'],
      { experimentId, jobId },
      `/jobs/delete/${jobId}`,
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }

  async getJobLogs(id: string, experimentId: string = 'global') {
    const url = this.safeGetPath(
      'jobs',
      ['provider_logs'],
      { id },
      `/jobs/provider_logs/${id}`,
    );
    const res = await this.fetchWithAuth(`${url}?experimentId=${experimentId}`);
    return await this.handleResponse(res);
  }

  async getTasksOutput(id: string) {
    const url = this.safeGetPath(
      'jobs',
      ['tasks_output'],
      { id },
      `/jobs/${id}/tasks_output`,
    );
    const res = await this.fetchWithAuth(url);
    return await this.handleResponse(res);
  }
  async getJobStream(id: string) {
    const url = this.safeGetPath(
      'jobs',
      ['stream_output'],
      { id },
      `/jobs/stream_output/${id}`,
    );
    return this.fetchWithAuth(url);
  }
}

export const api = new TransformerLabAPI();
