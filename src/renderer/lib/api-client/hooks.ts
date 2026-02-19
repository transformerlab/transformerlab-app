/**
 * SWR hooks
 */
import useSWRRaw from 'swr';
import {
  fetchWithAuth,
  useSWRWithAuth as useSWR,
} from 'renderer/lib/authContext';
import { API_URL, getAPIFullPath } from './urls';
import { Endpoints } from './endpoints';
import { authenticatedFetch } from './functions';

const CONNECTION_HEALTH_TIMEOUT_MS = 10000;

/** Fetcher for healthz that times out so connection-lost detection works when server is down. */
async function healthzFetcherWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONNECTION_HEALTH_TIMEOUT_MS,
  );
  try {
    const res = await fetchWithAuth(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`healthz ${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export const fetcher = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  parseJson: boolean = true,
): Promise<any> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  const response = await fetchWithAuth(input as any, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const err: any = new Error('An error occurred fetching ' + response.url);
    // attach details for callers
    err.status = response.status;
    try {
      err.response = parseJson ? await response.json() : await response.text();
    } catch {
      err.response = null;
    }
    console.log(response);
    throw err;
  }

  if (parseJson) {
    const parsed = await response.json();
    return parsed;
  } else {
    const text = await response.text();
    return text;
  }
};

export function useModelStatus() {
  const api_url = API_URL();
  const isLocalMode =
    typeof window !== 'undefined' && window?.platform?.multiuser !== true;

  // Only set URL if in local mode, otherwise SWR won't make the request
  const url: string | null =
    api_url && isLocalMode ? api_url + 'server/worker_healthz' : null;

  // Poll every 2 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, isError, isLoading, mutate } = useSWR(url, fetcher, options);

  if (isError || data?.length === 0) {
    data = null;
  }

  return {
    models: data,
    isLoading,
    isError,
    mutate: mutate,
  };
}

export function usePluginStatus(experimentInfo: any) {
  const { data, isLoading, mutate } = useSWR(
    experimentInfo
      ? Endpoints.Experiment.ListScripts(experimentInfo?.id)
      : null,
    fetcher,
  );

  let outdatedPlugins = [];
  if (data && Array.isArray(data)) {
    outdatedPlugins = data.filter(
      (plugin: any) =>
        plugin?.gallery_version && plugin?.version != plugin?.gallery_version,
    );
  }

  return { data: outdatedPlugins, isLoading, mutate };
}

export function useServerStats() {
  const api_url = API_URL();
  const isLocalMode =
    typeof window !== 'undefined' && window?.platform?.multiuser !== true;
  const url: string | null =
    api_url && isLocalMode ? API_URL() + 'server/info' : null;

  // Poll every 1 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, isError, isLoading } = useSWR(url, fetcher, options);

  return {
    server: data,
    isLoading,
    isError,
  };
}

/**
 * Connection health check with timeout. Use this (not useServerStats) to decide
 * when to show ConnectionLostModal, so we get a definite fail after ~10s when
 * the server is down instead of hanging.
 */
export function useConnectionHealth(connection: string | null) {
  const base = connection?.trim() ?? '';
  const healthzUrl =
    base.length > 0
      ? (base.endsWith('/') ? base : `${base}/`) + 'healthz'
      : null;
  const { error, isLoading } = useSWRRaw(
    healthzUrl,
    healthzFetcherWithTimeout,
    {
      refreshInterval: 5000,
      errorRetryInterval: 5000,
      dedupingInterval: 2000,
    },
  );
  return { isError: !!error, isLoading };
}

const fetchAndGetErrorStatus = async (url: string) => {
  console.log('🛎️fetching', url);

  const res = await authenticatedFetch(url);

  // console.log('🛎️fetched', res);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error: any = new Error('An error occurred while fetching the data.');
    // Attach extra info to the error object.
    // error.info = await res.json(); //uncommenting this line breaks the error handling -- not sure why
    error.status = res.status;
    throw error;
  }

  return res.json();
};

/**
 * Check your localhost to see if the server is active
 */
export function useCheckLocalConnection() {
  const isLocalMode =
    typeof window !== 'undefined' && window?.platform?.multiuser !== true;
  const url = isLocalMode ? 'http://localhost:8338/' + 'server/info' : null;

  // Poll every 2 seconds
  const options = {
    refreshInterval: 500,
    refreshWhenOffline: true,
    refreshWhenHidden: true,
    shouldRetryOnError: true,
    errorRetryInterval: 500,
    errorRetryCount: 1000,
  };

  // eslint-disable-next-line prefer-const
  let { data, isError, mutate } = useSWR(url, fetchAndGetErrorStatus, options);

  return {
    server: data,
    error: isError,
    mutate: mutate,
  };
}
