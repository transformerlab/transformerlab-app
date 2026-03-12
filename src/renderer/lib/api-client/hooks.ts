/**
 * SWR hooks
 */
import React from 'react';
import useSWRRaw from 'swr';
import {
  fetchWithAuth,
  useSWRWithAuth as useSWR,
} from 'renderer/lib/authContext';
import { API_URL } from './urls';
import { Endpoints } from './endpoints';

const CONNECTION_HEALTH_TIMEOUT_MS = 10000;

/** Fetcher for healthz that times out so connection-lost detection works when server is down. */
async function healthzFetcherWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONNECTION_HEALTH_TIMEOUT_MS,
  );
  try {
    // Use a "simple" request (no extra headers) so health checks can't be
    // blocked behind CORS preflights during long-running operations.
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'include',
    });
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
    api_url && isLocalMode ? api_url + 'v1/models' : null;

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

/**
 * Connection health check with timeout. Use this to decide
 * when to show ConnectionLostModal, so we get a definite fail after ~10s when
 * the server is down instead of hanging.
 *
 * Requires multiple consecutive failures before reporting an error to avoid
 * false positives during long-running operations (e.g., provider launches).
 */
export function useConnectionHealth(connection: string | null) {
  const base = connection?.trim() ?? '';
  const healthzUrl =
    base.length > 0
      ? (base.endsWith('/') ? base : `${base}/`) + 'healthz'
      : null;

  // Track when error first appeared - require error to persist for 10+ seconds
  // This prevents false positives during long-running operations (2 polling cycles)
  const errorFirstSeenRef = React.useRef<number | null>(null);

  // Reset when connection changes
  React.useEffect(() => {
    errorFirstSeenRef.current = null;
  }, [connection]);

  const { error, isLoading, data } = useSWRRaw(
    healthzUrl,
    healthzFetcherWithTimeout,
    {
      refreshInterval: 5000,
      errorRetryInterval: 5000,
      dedupingInterval: 2000,
    },
  );

  // Track when error first appeared
  React.useEffect(() => {
    const hasError = error !== null && error !== undefined;
    const hasData = data !== undefined;

    if (hasError && errorFirstSeenRef.current === null) {
      // Error just appeared - record timestamp
      errorFirstSeenRef.current = Date.now();
    } else if (!hasError && hasData) {
      // Successful check - reset timestamp
      errorFirstSeenRef.current = null;
    }
  }, [error, data]);

  // Only report error if it has persisted for at least 10 seconds (2 polling cycles)
  // This prevents false positives during long-running operations
  // SWR polls every 5 seconds, so the modal will appear after 10-15 seconds of persistent errors
  const errorPersistedLongEnough =
    errorFirstSeenRef.current !== null &&
    Date.now() - errorFirstSeenRef.current >= 10000;
  const isError = errorPersistedLongEnough && !!error;

  return { isError, isLoading };
}
