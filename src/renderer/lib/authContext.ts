import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { API_URL } from './transformerlab-api-sdk';
import useSWR from 'swr';
import { getAPIFullPath, getPath } from './api-client/urls';
import {
  identifyUser,
  resetUser,
} from '../components/Shared/analytics/AnalyticsContext';
// Added types
export type Team = {
  id: string;
  name: string;
};

// export the AuthContextValue so consumers get correct types
export interface AuthContextValue {
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

export function getCurrentTeam(): Team | null {
  return _currentTeam;
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
  updateCurrentTeam(null);
}

// allow components to re-render when auth changes
export function subscribeAuthChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- 2. Refresh Logic (Singleton Pattern) ---

// We use a promise variable to ensure we only run ONE refresh request at a time,
// even if 5 API calls fail simultaneously.
let refreshPromise: Promise<void> | null = null;

async function handleRefresh(): Promise<void> {
  // If a refresh is already in progress, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const url = getAPIFullPath('auth', ['refresh'], {});

      // Cookie-based refresh: cookies are sent/set automatically with credentials: 'include'
      const refreshResponse = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!refreshResponse.ok) {
        // If refresh fails (e.g. 401), the refresh token cookie is invalid.
        console.error(
          '[REFRESH] Refresh failed with status:',
          refreshResponse.status,
        );
        throw new Error('Refresh failed');
      }

      // Cookies are refreshed by the server response, nothing to store locally
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

  // Cookie-based auth: credentials: 'include' sends cookies automatically
  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If Unauthorized (401)
  if (response.status === 401) {
    console.log(
      '[FETCH_WITH_AUTH] Got 401, attempting to refresh token for URL:',
      fullUrl,
    );
    try {
      // Attempt to refresh token via cookie-based refresh
      await handleRefresh();
      console.log(
        '[FETCH_WITH_AUTH] Refresh successful, retrying original request',
      );

      // Retry the original request (cookies are refreshed automatically)
      return fetch(fullUrl, {
        ...options,
        headers,
        credentials: 'include',
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [team, setTeamState] = useState<Team | null>(null);

  useEffect(() => {
    // Initialize team from localStorage
    setTeamState(getCurrentTeam());
    setInitializing(false);

    // Subscribe to team changes
    const unsub = subscribeAuthChange(() => {
      setTeamState(getCurrentTeam());
    });
    return unsub;
  }, []);

  // Fetch user data using cookie-based auth; presence of a valid user implies authentication
  const userKey = getAPIFullPath('users', ['me'], {}) ?? null;
  const {
    data: user,
    error: userError,
    isLoading: userIsLoading,
    mutate: userMutate,
  } = useSWR(userKey, (url) => fetchWithAuth(url).then((r) => r.json()));

  // Once we know the user result, derive isAuthenticated from it
  useEffect(() => {
    if (user && !userError) {
      if (!isAuthenticated) {
        setIsAuthenticated(true);
      }
    } else if (userError) {
      if (isAuthenticated) {
        setIsAuthenticated(false);
      }
    }
  }, [user, userError, isAuthenticated]);

  // Get a list of teams this user belongs to (only after user is known)
  const teamsKey =
    user && !userError ? getAPIFullPath('teams', ['list'], {}) : null;
  const { data: teamsData, mutate: teamsMutate } = useSWR(teamsKey, (url) =>
    fetchWithAuth(url).then((r) => r.json()),
  );

  useEffect(() => {
    // Logic to auto-select team if none selected
    const teams = teamsData?.teams;
    if (teams && teams.length > 0) {
      const current = getCurrentTeam();

      // Validate that the current team belongs to the current user
      if (current) {
        const updated = teams.find((t: Team) => t.id === current.id);
        if (!updated) {
          // Current team doesn't belong to this user - clear it and select first team
          updateCurrentTeam(teams[0]);
          setTeamState(teams[0]);
          document.cookie = `tlab_team_id=${teams[0].id}; path=/; SameSite=Lax`;
        } else if (updated.name !== current.name) {
          // Team name changed (e.g., rename) - update it
          const next = { id: updated.id, name: updated.name };
          updateCurrentTeam(next);
          setTeamState(next);
          document.cookie = `tlab_team_id=${next.id}; path=/; SameSite=Lax`;
        }
      } else {
        // No team selected - select the first team
        updateCurrentTeam(teams[0]);
        setTeamState(teams[0]);
        document.cookie = `tlab_team_id=${teams[0].id}; path=/; SameSite=Lax`;
      }
    } else if (teams && teams.length === 0) {
      // No teams available
      updateCurrentTeam(null);
      setTeamState(null);
    }
  }, [teamsData, isAuthenticated, team]);

  // Identify user in analytics when user data is available
  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id, {
        email: user.email,
      });
    }
  }, [user]);

  // Login handler
  const handleLogin = useCallback(
    async (username: string, password: string) => {
      console.log('Attempting login...');
      try {
        const form = new URLSearchParams({
          username: username,
          password: password,
        }).toString();

        // Cookie-based login: credentials: 'include' allows cookies to be set
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
          const error = new Error(
            `Login failed: ${res.status} ${JSON.stringify(data)}`,
          );
          (error as any).info = data;
          (error as any).status = res.status;
          return error;
        }

        // Login successful - cookies are set by the server
        // Set authenticated state to trigger user/teams data fetch
        setIsAuthenticated(true);

        // Revalidate user/teams data
        if (userMutate) userMutate();
        if (teamsMutate) teamsMutate();
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
      // Cookie-based logout: clears auth cookies on server
      await fetch(
        getAPIFullPath('auth', ['logout'], {}) || '/auth/cookie/logout',
        {
          method: 'POST',
          credentials: 'include',
        },
      );
    } catch {
      /* ignore errors */
    }
    logoutUser();
    resetUser();
    setIsAuthenticated(false);
    setTeamState(null);
    // Clear team cookie
    document.cookie = 'tlab_team_id=; Max-Age=0; path=/; SameSite=Lax';
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
      // Persist team selection in cookie so non-fetch requests (e.g. <img>) have team context
      if (next?.id) {
        document.cookie = `tlab_team_id=${next.id}; path=/; SameSite=Lax`;
      } else {
        document.cookie = 'tlab_team_id=; Max-Age=0; path=/; SameSite=Lax';
      }
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
      user,
      userError,
      userIsLoading,
      userMutate,
      login: handleLogin,
      logout: handleLogout,
      isAuthenticated,
      initializing,
      fetchWithAuth,
      team,
      setTeam: handleSetTeam,
    }),
    [
      user,
      userError,
      userIsLoading,
      userMutate,
      handleLogin,
      handleLogout,
      isAuthenticated,
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
