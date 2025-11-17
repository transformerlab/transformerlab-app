import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import useSWR from 'swr';
import { API_URL, fetcher } from './transformerlab-api-sdk';
import { getAPIFullPath, getPath } from './api-client/urls';
// Added types
interface AuthContextValue {
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  user: any;
  userError: any;
  userIsLoading: boolean;
  userMutate: any;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  initializing: boolean;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

interface AuthProviderProps {
  connection?: string;
  children: React.ReactNode;
}

// Update context generic
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let _accessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      /* ignore */
    }
  });
}

export function getAccessToken() {
  return _accessToken;
}

export function updateAccessToken(token: string | null) {
  _accessToken = token;
  try {
    if (token) localStorage.setItem('access_token', token);
    else localStorage.removeItem('access_token');
  } catch (e) {
    /* ignore storage errors */
  }
  notifyListeners();
}

export function logoutUser() {
  // Optionally call server logout endpoint here.
  updateAccessToken(null);
}

// allow components to re-render when auth changes
export function subscribeAuthChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// --- Step 2: Refresh Handler ---
async function handleRefresh() {
  try {
    const refreshResponse = await fetch(getAPIFullPath('users', ['me'], {}), {
      method: 'POST',
      credentials: 'include',
    });

    if (!refreshResponse.ok) {
      throw new Error('Not Authorized');
    }

    const data = await refreshResponse.json();
    updateAccessToken(data.access_token);
    return data.access_token;
  } catch (error) {
    console.error('Token refresh failed. Logging out.', error);
    logoutUser();
    throw error;
  }
}

// --- Step 3: Wrapper Fetch Function ---
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const fullUrl = `${API_URL()}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...((options && options.headers) || {}),
      Authorization: `Bearer ${token ?? ''}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (response.status === 401) {
    // try refresh and retry once
    try {
      const newAccessToken = await handleRefresh();
      return fetch(fullUrl, {
        ...options,
        headers: {
          ...((options && options.headers) || {}),
          Authorization: `Bearer ${newAccessToken ?? ''}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
    } catch (e) {
      // handleRefresh already logged out and threw
      throw e;
    }
  }

  return response;
}

export function AuthProvider({ connection, children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  const connectionKey = connection ? connection.replace(/\./g, '-') : '';
  // Replace previous token load effects with subscription
  useEffect(() => {
    // Initialize current token immediately
    setToken(getAccessToken());
    setInitializing(false);
    const unsub = subscribeAuthChange(() => {
      setToken(getAccessToken());
    });
    return unsub;
  }, []);
  // Remove old window.storage persistence effect
  // ...existing code...
  const {
    data: user,
    error: userError,
    isLoading: userIsLoading,
    mutate: userMutate,
  } = useSWR(
    token ? (getAPIFullPath('users', ['me'], {}) ?? null) : null,
    token
      ? (endpoint) =>
          fetcher(endpoint, {
            headers: { Authorization: `Bearer ${token}` },
          })
      : null,
  );
  // New login handler
  const handleLogin = useCallback(async () => {
    console.log('Attempting login...');
    try {
      const form = new URLSearchParams({
        username: 'test@example.com',
        password: 'password123',
      }).toString();
      const res = await fetch(getAPIFullPath('auth', ['login'], {}), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        credentials: 'include',
      });
      const data = await (async () => {
        try {
          return await res.json();
        } catch {
          return {};
        }
      })();
      if (!res.ok) {
        console.error(`Login failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }
      const newToken =
        data.access_token ?? data.token ?? data.accessToken ?? null;
      if (newToken) {
        updateAccessToken(newToken);
        setToken(newToken);
        // Revalidate user data after login
        if (userMutate) userMutate();
      } else {
        console.error(
          `Login succeeded but no token returned: ${JSON.stringify(data)}`,
        );
      }
    } catch (e) {
      console.error(`Login error: ${e?.message ?? String(e)}`);
    }
  }, [userMutate]);
  // Register handler
  const handleRegister = useCallback(async () => {
    try {
      const body = {
        email: 'test@example.com',
        password: 'password123',
      };
      const res = await fetchWithAuth('auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await (async () => {
        try {
          return await res.json();
        } catch {
          return {};
        }
      })();
      if (!res.ok) {
        console.error(`Register failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }
      const newToken =
        data.access_token ?? data.token ?? data.accessToken ?? null;
      if (newToken) {
        updateAccessToken(newToken);
        setToken(newToken);
        // Revalidate user data after register
        if (userMutate) userMutate();
      } else {
        console.log(`Register succeeded: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`Register error: ${e?.message ?? String(e)}`);
    }
  }, [userMutate]);
  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await fetch(getAPIFullPath('Auth', ['logout'], {}), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* ignore errors */
    }
    logoutUser();
    setToken(null);
    if (userMutate) userMutate(null, false);
  }, [userMutate]);
  // Backward-compatible aliases
  const login = handleLogin;
  const logout = handleLogout;
  const isAuthenticated = !!token;
  const contextValue = useMemo(
    () => ({
      token,
      setToken,
      user,
      userError,
      userIsLoading,
      userMutate,
      // new handlers
      handleLogin,
      handleLogout,
      handleRegister,
      // aliases
      login,
      logout,
      // ui states
      isAuthenticated,
      initializing,
      fetchWithAuth,
    }),
    [
      token,
      user,
      userError,
      userIsLoading,
      userMutate,
      handleLogin,
      handleLogout,
      handleRegister,
      login,
      logout,
      isAuthenticated,
      initializing,
    ],
  );
  // Replace JSX return (file is .ts)
  return React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    children,
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

/* The following useAPI hook is the same as the useAPI hook in api-client/hooks.ts,
but this one uses the new auth we have for fastapi-users, instead of the auth
implemented using workos */
export function useAPI(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any> = {},
  options: any = {},
) {
  let path: string | null = getPath(majorEntity, pathArray, params) as any;
  const fetcher = async (url: string) => {
    // check for an access token. Will be "" if user not logged in.
    const accessToken = await getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetchWithAuth(url, {
      headers,
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
