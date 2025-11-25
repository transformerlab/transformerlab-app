import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { API_URL } from './urls';

type StorageBridge = {
  get?: (key: string) => Promise<string | null | undefined>;
  set?: (key: string, value: string | null | undefined) => Promise<void>;
  delete?: (key: string) => Promise<void>;
};

const getStorageBridge = (): StorageBridge | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as any).storage as StorageBridge | undefined;
};

const ACCESS_TOKEN_KEYS = ['access_token', 'accessToken'];
const REFRESH_TOKEN_KEYS = ['refresh_token', 'refreshToken'];
const TEAM_KEYS = ['current_team', 'currentTeam'];

type StoredTeam = {
  id?: string;
  name?: string;
  slug?: string;
};

async function setBridgeValue(
  keys: string[],
  value: string | null | undefined,
) {
  const storage = getStorageBridge();
  if (!storage) {
    return;
  }

  for (const key of keys) {
    try {
      if (value !== undefined && value !== null) {
        await storage.set?.(key, value);
      } else {
        await storage.delete?.(key);
      }
    } catch {
      /* ignore electron storage bridge errors */
    }
  }
}

function setBrowserValue(keys: string[], value: string | null | undefined) {
  if (typeof window === 'undefined') {
    return;
  }

  for (const key of keys) {
    try {
      if (value !== undefined && value !== null) {
        window.localStorage?.setItem(key, value);
      } else {
        window.localStorage?.removeItem(key);
      }
    } catch {
      /* ignore localStorage errors */
    }
  }
}

async function getBridgeValue(keys: string[]) {
  const storage = getStorageBridge();
  if (!storage) {
    return null;
  }

  for (const key of keys) {
    try {
      const value = await storage.get?.(key);
      if (value) {
        return value;
      }
    } catch {
      /* ignore bridge errors */
    }
  }
  return null;
}

function getBrowserValue(keys: string[]) {
  if (typeof window === 'undefined') {
    return null;
  }

  for (const key of keys) {
    try {
      const value = window.localStorage?.getItem(key);
      if (value) {
        return value;
      }
    } catch {
      /* ignore localStorage errors */
    }
  }

  return null;
}

function normalizeTeam(value: unknown): StoredTeam | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as StoredTeam;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    return value as StoredTeam;
  }
  return null;
}

async function getStoredTeam() {
  const bridgeValue = await getBridgeValue(TEAM_KEYS);
  const normalizedBridge = normalizeTeam(bridgeValue);
  if (normalizedBridge?.id) {
    return normalizedBridge;
  }
  const browserValue = getBrowserValue(TEAM_KEYS);
  const normalizedBrowser = normalizeTeam(browserValue);
  if (normalizedBrowser?.id) {
    return normalizedBrowser;
  }
  return null;
}

export async function login(username: string, password: string) {
  const loginURL = getAPIFullPath('auth', ['login'], {});

  // Login data needs to be provided as form data
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);

  let result: any = {};
  try {
    const response = await fetch(loginURL, {
      method: 'POST',
      body: formData,
    });
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Login exception: ' + error,
    };
  }

  // API Successfully returned, but was the authentication successful?
  const accessToken = result?.access_token;
  if (accessToken) {
    await setAccessToken(accessToken);
    return {
      status: 'success',
      message: 'Logged in as ' + username,
    };
  } else {
    return {
      status: 'unauthorized',
      message: 'Username or password incorrect',
    };
  }
}

export async function setAccessToken(token: string | null | undefined) {
  const hasToken = Boolean(token);
  await setBridgeValue(ACCESS_TOKEN_KEYS, hasToken ? token : null);
  setBrowserValue(ACCESS_TOKEN_KEYS, hasToken ? token : null);
}

export async function getAccessToken() {
  const bridgeToken = await getBridgeValue(ACCESS_TOKEN_KEYS);
  if (bridgeToken) {
    return bridgeToken;
  }

  const browserToken = getBrowserValue(ACCESS_TOKEN_KEYS);
  if (browserToken) {
    return browserToken;
  }

  return '';
}

// Helper function to create authenticated fetch requests
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  const accessToken = await getAccessToken();
  const team = await getStoredTeam();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (team?.id) {
    headers['X-Team-Id'] = team.id;
  }
  if (team?.name) {
    headers['X-Team-Name'] = team.name;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export async function logout() {
  try {
    const apiBase = API_URL();
    if (apiBase) {
      await fetch(`${apiBase}auth/logout`, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
      });
    }
  } catch (e) {
    // ignore network errors; proceed to clear local tokens
  } finally {
    await setBridgeValue(ACCESS_TOKEN_KEYS, null);
    await setBridgeValue(REFRESH_TOKEN_KEYS, null);
    await setBridgeValue(TEAM_KEYS, null);
    setBrowserValue(ACCESS_TOKEN_KEYS, null);
    setBrowserValue(REFRESH_TOKEN_KEYS, null);
    setBrowserValue(TEAM_KEYS, null);
  }
}

export async function setRefreshToken(token: string | null | undefined) {
  const hasToken = Boolean(token);
  await setBridgeValue(REFRESH_TOKEN_KEYS, hasToken ? token : null);
  setBrowserValue(REFRESH_TOKEN_KEYS, hasToken ? token : null);
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
) {
  const registerURL = getAPIFullPath('auth', ['register'], {});
  const userJSON = {
    name: name,
    email: email,
    password: password,
  };

  let result: any = {};
  try {
    const response = await fetch(registerURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userJSON),
    });
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Register user exception: ' + error,
    };
  }

  console.log(result);
  if (result?.email) {
    return {
      status: 'success',
      message: `User ${result?.email} added.`,
    };
  } else {
    return {
      status: 'error',
      message: result?.message,
    };
  }
}

export async function downloadModelFromHuggingFace(
  modelName: string,
  job_id = null,
) {
  console.log(encodeURIComponent(modelName));

  let requestString = `${API_URL()}model/download_from_huggingface?model=${encodeURIComponent(
    modelName,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }

  let result = {};
  try {
    const response = await fetch(requestString, {
      credentials: 'include', // Send cookies with the request
    });
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Fetch exception: ' + error,
    };
  }

  return result;
}

export async function downloadGGUFFile(
  modelId: string,
  filename: string,
  job_id = null,
) {
  let requestString = `${API_URL()}model/download_gguf_file?model=${encodeURIComponent(
    modelId,
  )}&filename=${encodeURIComponent(filename)}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }

  let result = {};
  try {
    const response = await fetch(requestString, {
      credentials: 'include', // Send cookies with the request
    });
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Fetch exception: ' + error,
    };
  }

  return result;
}

export async function downloadModelFromGallery(
  galleryID: string,
  job_id = null,
) {
  console.log(encodeURIComponent(galleryID));

  let requestString = `${API_URL()}model/download_model_from_gallery?gallery_id=${encodeURIComponent(
    galleryID,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }
  const response = await fetch(requestString, {
    credentials: 'include', // Send cookies with the request
  });
  const result = await response.json();

  return result;
}

// Return the models that the controller can see
export async function activeModels() {
  let response;
  try {
    response = await authenticatedFetch(`${API_URL()}v1/models`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching active models', error);
    return null;
  }
}

// Right now health function is the same as activeModels
// But later we can add a health endpoint to the API
export async function apiHealthz() {
  let response;
  try {
    response = await authenticatedFetch(`${API_URL()}healthz`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching API', error);
    return null;
  }
}

export async function controllerHealthz() {
  let response;
  try {
    // For now we hard code the worker to the default FastChat API port of 21002
    response = await authenticatedFetch(API_URL() + 'v1/models', {
      method: 'GET',
    });
    if (response.ok) {
      const result = await response.json();
      return result;
    }
    return null;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function localaiHealthz() {
  let response;
  try {
    response = await authenticatedFetch(API_URL() + 'v1/models');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function getComputerInfo() {
  let response;
  try {
    response = await authenticatedFetch(API_URL() + 'server/info');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching computer info', error);
    return null;
  }
}

export async function activateWorker(
  modelName: string,
  modelFilename: string | null = null,
  modelArchitecture: string = '',
  adaptorName: string = '',
  engine: string | null = 'default',
  parameters: object = {},
  experimentId: string = '',
) {
  let response;

  let model = modelName;
  // if (adaptorName !== '') {
  //   model = `workspace/adaptors/${modelName}/${adaptorName}`;
  // }

  if (modelFilename !== null) {
    model = `${model}&model_filename=${modelFilename}`;
  }

  const paramsJSON = JSON.stringify(parameters);

  try {
    response = await authenticatedFetch(
      API_URL() +
        'server/worker_start?model_name=' +
        model +
        '&adaptor=' +
        adaptorName +
        '&model_architecture=' +
        modelArchitecture +
        '&engine=' +
        engine +
        '&experiment_id=' +
        experimentId +
        '&parameters=' +
        paramsJSON,
    );
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with starting worker api call ', error);
    return undefined;
  }
}

export async function killWorker() {
  let response;
  try {
    response = await authenticatedFetch(API_URL() + 'server/worker_stop');
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with killing worker api call ', error);
    return undefined;
  }
}

export function GET_EXPERIMENT_UPDATE_CONFIG_URL(
  id: string,
  key: string,
  value: string | undefined,
) {
  if (value === undefined) {
    value = '';
  }
  return (
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    value
  );
}

export async function EXPERIMENT_ADD_EVALUATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/evals/add',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_EVALUATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/evals/edit',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_ADD_GENERATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/generations/add',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_GENERATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/generations/edit',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export function TEMPLATE_FOR_MODEL_URL(model: string) {
  return `${API_URL()}model/get_conversation_template?model=${model}`;
}

export async function getTemplateForModel(modelName: string) {
  if (!modelName) {
    return null;
  }
  const model = modelName.split('/')[1];
  const response = await authenticatedFetch(TEMPLATE_FOR_MODEL_URL(model));
  const result = await response.json();

  return result;
}
