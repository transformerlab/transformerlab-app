import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { API_URL, fetcher } from './transformerlab-api-sdk';
import useSWR from 'swr';
import { getAPIFullPath, getPath } from './api-client/urls';
// Added types
export type Team = {
  id: string;
  name: string;
};

// export the AuthContextValue so consumers get correct types
export interface AuthContextValue {
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  user: any;
  userError: any;
  userIsLoading: boolean;
  userMutate: any;
  login: (username: string, password: string) => Promise<void | Error>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  initializing: boolean;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  team: Team | null;
  setTeam: React.Dispatch<React.SetStateAction<Team | null>>;
}

interface AuthProviderProps {
  connection?: string;
  children: React.ReactNode;
}

// Update context generic to use null as the empty value
const AuthContext = createContext<AuthContextValue | null>(null);

// Team in-memory cache
let _currentTeam: Team | null = null;
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('current_team');
    if (raw) _currentTeam = JSON.parse(raw) as Team;
  } catch {
    _currentTeam = null;
  }
}

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
  return localStorage.getItem('access_token');
}

export function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

export function getCurrentTeam(): Team | null {
  return _currentTeam;
}

export function updateAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem('access_token', token);
    else localStorage.removeItem('access_token');
  } catch (e) {
    /* ignore storage errors */
  }
  notifyListeners();
}

// Refresh token storage
export function updateRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem('refresh_token', token);
    else localStorage.removeItem('refresh_token');
  } catch (e) {
    /* ignore storage errors */
  }
  // We usually don't need to notify listeners for refresh token changes,
  // but strictly speaking, auth state has changed.
}

export function updateCurrentTeam(team: Team | null) {
  _currentTeam = team;
  try {
    if (team) localStorage.setItem('current_team', JSON.stringify(team));
    else localStorage.removeItem('current_team');
  } catch {
    /* ignore */
  }
  notifyListeners();
}

export function logoutUser() {
  updateAccessToken(null);
  updateRefreshToken(null); // Clear refresh token
  updateCurrentTeam(null);
}

// allow components to re-render when auth changes
export function subscribeAuthChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// --- 2. Refresh Logic (Singleton Pattern) ---

// We use a promise variable to ensure we only run ONE refresh request at a time,
// even if 5 API calls fail simultaneously.
let refreshPromise: Promise<string> | null = null;

async function handleRefresh(): Promise<string> {
  // If a refresh is already in progress, return the existing promise
  if (refreshPromise) {
    const currentToken = getRefreshToken();
    if (!currentToken) {
      console.warn(
        '[REFRESH] WARNING: Returning existing promise but token is MISSING - this promise will likely fail',
      );
    }
    return refreshPromise;
  }

  const refreshTokenAtCreation = getRefreshToken();

  // Check token BEFORE creating promise - fail fast if missing
  if (!refreshTokenAtCreation) {
    console.error(
      '[REFRESH] No refresh token available - cannot create refresh promise',
    );
    throw new Error('No refresh token available');
  }

  refreshPromise = (async () => {
    try {
      // Double-check token inside promise (it might have been cleared)
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        console.error(
          '[REFRESH] No refresh token available - token was cleared after promise creation',
        );
        throw new Error('No refresh token available');
      }

      const url = getAPIFullPath('auth', ['refresh'], {});

      const refreshResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      if (!refreshResponse.ok) {
        // If refresh fails (e.g. 401), the refresh token is invalid.
        console.error(
          '[REFRESH] Refresh failed with status:',
          refreshResponse.status,
        );
        throw new Error('Refresh failed');
      }

      const data = await refreshResponse.json();

      // 1. Update Access Token
      const newAccessToken = data.access_token;
      updateAccessToken(newAccessToken);

      // 2. Update Refresh Token (Rotation)
      // The backend should return a new refresh token.
      if (data.refresh_token) {
        updateRefreshToken(data.refresh_token);
      } else {
        console.warn('[REFRESH] No new refresh token in response');
      }

      return newAccessToken;
    } catch (error) {
      console.error('[REFRESH] Token refresh failed. Logging out.', error);
      logoutUser();
      throw error;
    } finally {
      // Reset the promise so future failures trigger a new refresh
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// --- 3. Wrapper Fetch Function ---
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const currentTeam = getCurrentTeam();

  // Handle cases where url might be partial or full
  // Ideally fetchWithAuth is passed a relative path, but we handle both.
  let fullUrl: string;
  if (url.startsWith('http')) {
    fullUrl = url;
  } else {
    const baseUrl = API_URL();
    if (baseUrl === null) {
      // Default to same host as frontend with API port if API_URL is not set
      // Ensure URL doesn't start with / (baseUrl already has trailing slash)
      const cleanPath = url.startsWith('/') ? url.slice(1) : url;
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      fullUrl = `${protocol}//${hostname}:8338/${cleanPath}`;
    } else {
      // baseUrl already has trailing slash from API_URL()
      fullUrl = `${baseUrl}${url}`;
    }
  }

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
    // Only set Content-Type if body is not FormData (browser will set it with boundary for FormData)
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(currentTeam
      ? { 'X-Team-Id': currentTeam.id, 'X-Team-Name': currentTeam.name }
      : {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // If Unauthorized (401)
  if (response.status === 401) {
    console.log(
      '[FETCH_WITH_AUTH] Got 401, attempting to refresh token for URL:',
      fullUrl,
    );
    try {
      // Attempt to refresh token
      const newAccessToken = await handleRefresh();
      console.log(
        '[FETCH_WITH_AUTH] Refresh successful, retrying original request',
      );

      // Retry the original request with new token
      return fetch(fullUrl, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${newAccessToken}`,
        },
      });
    } catch (e) {
      // Refresh failed (and user was logged out inside handleRefresh)
      console.error('[FETCH_WITH_AUTH] Refresh failed, throwing error:', e);
      throw e;
    }
  }

  return response;
}

export function AuthProvider({ connection, children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [team, setTeamState] = useState<Team | null>(null);

  useEffect(() => {
    // Initialize
    setToken(getAccessToken());
    setTeamState(getCurrentTeam());
    setInitializing(false);

    // Check for OAuth callback tokens in URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const accessToken = urlParams.get('access_token');
      const refreshToken = urlParams.get('refresh_token');

      if (accessToken) {
        updateAccessToken(accessToken);
        setToken(accessToken);
      }
      if (refreshToken) {
        updateRefreshToken(refreshToken);
      }

      // Clean up URL if tokens were found
      if (accessToken || refreshToken) {
        // Remove the query params
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }
    }

    // Subscribe
    const unsub = subscribeAuthChange(() => {
      setToken(getAccessToken());
      setTeamState(getCurrentTeam());
    });
    return unsub;
  }, []);

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

  // Get a list of teams this user belongs to
  // using useSWR directly or your hook (assuming your hook uses fetchWithAuth internally or similar logic)
  // Since useAPI in your snippet calls fetchWithAuth, it will auto-refresh too!
  const { data: teamsData, mutate: teamsMutate } = useSWR(
    token ? getAPIFullPath('teams', ['list'], {}) : null,
    token ? (url) => fetchWithAuth(url).then((r) => r.json()) : null,
  );

  useEffect(() => {
    // Logic to auto-select team if none selected
    const teams = teamsData?.teams;
    if (teams && teams.length > 0) {
      if (!getCurrentTeam()) {
        updateCurrentTeam(teams[0]);
        setTeamState(teams[0]);
      }

      // Keep the cached team in sync if its name changed (e.g., rename)
      const current = getCurrentTeam();
      if (current) {
        const updated = teams.find((t: Team) => t.id === current.id);
        if (updated && updated.name !== current.name) {
          const next = { id: updated.id, name: updated.name };
          updateCurrentTeam(next);
          setTeamState(next);
        }
      }
    } else if (teams && teams.length === 0) {
      // No teams available
      updateCurrentTeam(null);
      setTeamState(null);
    }
  }, [teamsData, token, team]);

  // Login handler
  const handleLogin = useCallback(
    async (username: string, password: string) => {
      console.log('Attempting login...');
      try {
        const form = new URLSearchParams({
          username: username,
          password: password,
        }).toString();

        const res = await fetch(getAPIFullPath('auth', ['login'], {}), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
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
          const error = new Error(
            `Login failed: ${res.status} ${JSON.stringify(data)}`,
          );
          (error as any).info = data;
          (error as any).status = res.status;
          return error;
        }

        const newToken =
          data.access_token ?? data.token ?? data.accessToken ?? null;
        const newRefreshToken = data.refresh_token ?? data.refreshToken ?? null;

        if (newToken) {
          updateAccessToken(newToken);
          setToken(newToken);

          // Store refresh token if present
          if (newRefreshToken) {
            updateRefreshToken(newRefreshToken);
          }

          // Revalidate user/teams data
          if (userMutate) userMutate();
          if (teamsMutate) teamsMutate();
        } else {
          console.error(
            `Login succeeded but no token returned: ${JSON.stringify(data)}`,
          );
        }
      } catch (e) {
        console.error(
          `Login error: ${e instanceof Error ? e.message : String(e)}`,
        );
        return e instanceof Error ? e : new Error(String(e));
      }
    },
    [userMutate, teamsMutate],
  );

  // // Register handler
  // const handleRegister = useCallback(async () => {
  //   try {
  //     const body = {
  //       email: 'test@example.com',
  //       password: 'password123',
  //     };
  //     const res = await fetchWithAuth('auth/register', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(body),
  //     });

  //     // Note: Register usually doesn't return tokens in fastapi-users default flow,
  //     // but if it does, we handle it.
  //     if (!res.ok) return;

  //     const data = await res.json();
  //     const newToken = data.access_token;
  //      if (newToken) {
  //       updateAccessToken(newToken);
  //       setToken(newToken);
  //       if (userMutate) userMutate();
  //     }
  //   } catch (e) {
  //     console.error(`Register error: ${e instanceof Error ? e.message : String(e)}`);
  //   }
  // }, [userMutate]);

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await fetch(
        getAPIFullPath('auth', ['logout'], {}) || '/auth/jwt/logout',
        {
          method: 'POST',
        },
      );
    } catch {
      /* ignore errors */
    }
    logoutUser();
    setToken(null);
    setTeamState(null);
    if (userMutate) userMutate(null, false);
  }, [userMutate]);

  const handleSetTeam = useCallback(
    (value: React.SetStateAction<Team | null>) => {
      const next =
        typeof value === 'function'
          ? (value as (prev: Team | null) => Team | null)(team)
          : value;
      updateCurrentTeam(next);
      setTeamState(next);
      // If the team changes, we reload the app to ensure all components pick up new team context
      // But only do this if the team actually changed
      if (next?.id !== team?.id) {
        window.location.reload();
      }
    },
    [team],
  );

  const contextValue = useMemo(
    () => ({
      token,
      setToken,
      user,
      userError,
      userIsLoading,
      userMutate,
      login: handleLogin,
      logout: handleLogout,
      isAuthenticated: !!token,
      initializing,
      fetchWithAuth,
      team,
      setTeam: handleSetTeam,
    }),
    [
      token,
      user,
      userError,
      userIsLoading,
      userMutate,
      handleLogin,
      handleLogout,
      initializing,
      team,
      handleSetTeam,
    ],
  );

  return React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    children,
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

// Helper hook for components
export function useAPI(
  majorEntity: string,
  pathArray: string[],
  params: Record<string, any> = {},
  options: any = {},
) {
  let path: string | null = getPath(majorEntity, pathArray, params) as any;

  const fetcher = async (url: string) => {
    // Use fetchWithAuth which handles the token injection and 401 refresh logic
    const res = await fetchWithAuth(url);

    if (res.status === 401) {
      // Should have been handled by fetchWithAuth, but if still 401, return error
      return { status: 'unauthorized', message: 'User not authorized' };
    }

    if (!res.ok) {
      return { status: 'error', message: 'API returned HTTP ' + res.status };
    }

    return res.json();
  };

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

  return { data, error, isLoading, mutate };
}

// Create a new function called useSWRWithAuth which is EXACTLY the same as useSWR,
// but uses fetchWithAuth as the fetcher.
export function useSWRWithAuth(
  key: string | null,
  fetcher_unused?: any,
  options?: any,
) {
  const fetcher = async (url: string) => {
    const res = await fetchWithAuth(url);

    if (res.status === 401) {
      // Should have been handled by fetchWithAuth, but if still 401, return error
      const error: any = new Error('User not authorized');
      error.status = 'unauthorized';
      throw error;
    }

    if (!res.ok) {
      const error: any = new Error('API returned HTTP ' + res.status);
      error.status = res.status;
      throw error;
    }

    return res.json();
  };
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, options);

  return {
    data,
    isLoading,
    isError: error,
    mutate,
  };
}
