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
import { getAPIFullPath } from './api-client/urls';
// Added types
interface AuthContextValue {
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  user: any;
  userError: any;
  userIsLoading: boolean;
  userMutate: any;
  handleTestApi: () => Promise<void>;
  handleGetCurrentUser: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  apiResult: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  initializing: boolean;
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
      throw new Error('Refresh failed');
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
  // New UI / API feedback states
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

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
    setApiResult(null);
    setLoading(true);

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
        setApiResult(`Login failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }
      const newToken =
        data.access_token ?? data.token ?? data.accessToken ?? null;
      if (newToken) {
        updateAccessToken(newToken);
        setToken(newToken);
        setApiResult('Login successful');
        // Revalidate user data after login
        if (userMutate) userMutate();
      } else {
        setApiResult(
          `Login succeeded but no token returned: ${JSON.stringify(data)}`,
        );
      }
    } catch (e) {
      setApiResult(`Login error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [userMutate]);
  // Register handler
  const handleRegister = useCallback(async () => {
    setApiResult(null);
    setLoading(true);
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
        setApiResult(`Register failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }
      const newToken =
        data.access_token ?? data.token ?? data.accessToken ?? null;
      if (newToken) {
        updateAccessToken(newToken);
        setToken(newToken);
        setApiResult('Register successful and logged in');
        // Revalidate user data after register
        if (userMutate) userMutate();
      } else {
        setApiResult(`Register succeeded: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      setApiResult(`Register error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [userMutate]);
  // Test authenticated route
  const handleTestApi = useCallback(async () => {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await fetchWithAuth('test-users/authenticated-route', {
        method: 'GET',
      });
      const text = await res.text();
      setApiResult(`Status: ${res.status} — Body: ${text}`);
    } catch (e) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);
  // Get current user info
  const handleGetCurrentUser = useCallback(async () => {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await fetchWithAuth('users/me', { method: 'GET' });
      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      setApiResult(
        `Status: ${res.status} — Body: ${JSON.stringify(body, null, 2)}`,
      );
    } catch (e) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);
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
      handleTestApi,
      handleGetCurrentUser,
      // aliases
      login,
      logout,
      // ui states
      apiResult,
      loading,
      isAuthenticated,
      initializing,
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
      handleTestApi,
      handleGetCurrentUser,
      login,
      logout,
      apiResult,
      loading,
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
