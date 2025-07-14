/**
 * SWR hooks
 */
import useSWR from 'swr';
import { API_URL, getAPIFullPath } from './urls';
import { Endpoints } from './endpoints';
import { getAccessToken } from './functions';

export function useAPI(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any> = {},
  options: any = {},
) {
  let path = getAPIFullPath(majorEntity, pathArray, params);
  const fetcher = async (url: string) => {
    // check for an access token. Will be "" if user not logged in.
    const accessToken = await getAccessToken();

    return fetch(url, {
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : '',
        'Content-Type': 'application/json',
      },
    }).then((res) => {
      // Check for HTTP 401 which means user is not authorized
      if (res.status === 401) {
        return {
          status: 'unauthorized',
          message: 'User not authorized',
        };
      }

      // If there was an error then report in standard API format
      if (!res.ok) {
        console.log('Unexpected API response:');
        console.log(res);
        return {
          status: 'error',
          message: 'API returned HTTP ' + res.status,
        };
      }

      // Otherwise return the JSON contained in the API response
      return res.json();
    });
  };

  // If any of the params are null or undefined, return null:
  if (
    Object.values(params).some((param) => param === null || param === undefined)
  ) {
    path = null;
  }

  const { data, error, isLoading, mutate } = useSWR(path, fetcher, {
    ...options,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    data,
    error,
    isLoading,
    mutate,
  };
}

const fetcher = (...args: any[]) =>
  fetch(...args).then((res) => {
    if (!res.ok) {
      const error = new Error('An error occurred fetching ' + res.url);
      error.response = res.json();
      error.status = res.status;
      console.log(res);
      throw error;
    }
    return res.json();
  });

export function useModelStatus() {
  const api_url = API_URL();
  const url = api_url ? api_url + 'server/worker_healthz' : null;

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
  const url = api_url ? API_URL() + 'server/info' : null;

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

const fetchAndGetErrorStatus = async (url) => {
  console.log('🛎️fetching', url);

  const res = await fetch(url);

  // console.log('🛎️fetched', res);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
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
