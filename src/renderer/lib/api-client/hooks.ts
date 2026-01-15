/**
 * SWR hooks
 */
import {
  fetchWithAuth,
  useSWRWithAuth as useSWR,
} from 'renderer/lib/authContext';
import { API_URL, getAPIFullPath } from './urls';
import { Endpoints } from './endpoints';
import { authenticatedFetch } from './functions';
import { useServerMode } from '../ServerModeContext';

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
  const { isLocalMode } = useServerMode();

  // Only set URL if in local mode, otherwise SWR won't make the request
  const url: string | null =
    api_url && isLocalMode ? api_url + 'server/worker_healthz' : null;

  // Poll every 2 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading, mutate } = useSWR(url, fetcher, options);

  if (error || data?.length === 0) {
    data = null;
  }

  return {
    models: data,
    isLoading,
    isError: error,
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
  const url: string | null = api_url ? API_URL() + 'server/info' : null;

  // Poll every 1 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading } = useSWR(url, fetcher, options);

  return {
    server: data,
    isLoading,
    isError: error,
  };
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
  const url = 'http://localhost:8338/' + 'server/info';

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
  let { data, error, mutate } = useSWR(url, fetchAndGetErrorStatus, options);

  return {
    server: data,
    error: error,
    mutate: mutate,
  };
}
