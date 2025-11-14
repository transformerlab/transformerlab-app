import React, { useEffect, useState } from 'react';
import { API_URL } from 'renderer/lib/transformerlab-api-sdk';

/*
  Minimal in-file auth utilities and request helpers.
  - getAccessToken / updateAccessToken / logoutUser
  - simple subscription so components re-render on auth change
  - handleRefresh and fetchWithAuth as in your example
*/

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
    const refreshResponse = await fetch(`${API_URL()}auth/refresh`, {
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

// --- React component ---
export default function UserLoginTest(): JSX.Element {
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuthChange(() => setToken(getAccessToken()));
    return unsub;
  }, []);

  async function handleLogout() {
    // optionally notify backend
    try {
      await fetch(`${API_URL()}auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      /* ignore errors */
    }
    logoutUser();
  }

  // <-- Add this login handler
  async function handleLogin() {
    setApiResult(null);
    setLoading(true);
    try {
      const form = new URLSearchParams({
        username: 'test@example.com',
        password: 'password123',
      }).toString();

      const res = await fetch(`${API_URL()}auth/jwt/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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
        setApiResult(`Login failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }

      // common token fields
      const token = data.access_token ?? data.token ?? data.accessToken ?? null;
      if (token) {
        updateAccessToken(token);
        setApiResult('Login successful');
      } else {
        setApiResult(
          `Login succeeded but no token returned: ${JSON.stringify(data)}`,
        );
      }
    } catch (e: any) {
      setApiResult(`Login error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }
  // <-- end added handler

  // <-- Add this register handler
  async function handleRegister() {
    setApiResult(null);
    setLoading(true);
    try {
      const body = {
        email: 'test@example.com',
        password: 'password123',
      };

      const res = await fetch(`${API_URL()}auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      // If the register endpoint returns an access token, use it to sign in immediately.
      const token = data.access_token ?? data.token ?? data.accessToken ?? null;
      if (token) {
        updateAccessToken(token);
        setApiResult('Register successful and logged in');
      } else {
        setApiResult(`Register succeeded: ${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      setApiResult(`Register error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }
  // <-- end register handler

  async function handleTestApi() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await fetchWithAuth('test-users/authenticated-route', {
        method: 'GET',
      });
      const text = await res.text();
      setApiResult(`Status: ${res.status} — Body: ${text}`);
    } catch (e: any) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // Fetch current user info (common FastAPI-Users route: GET /users/me)
  async function handleGetCurrentUser() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await fetchWithAuth('users/me', { method: 'GET' });
      // Prefer JSON response for user info
      let body: any;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      setApiResult(
        `Status: ${res.status} — Body: ${JSON.stringify(body, null, 2)}`,
      );
    } catch (e: any) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div>
        <strong>Login status:</strong> {token ? 'Logged in' : 'Not logged in'}
      </div>

      {token ? (
        <div>
          <button onClick={handleLogout}>Logout</button>
        </div>
      ) : (
        <div>
          {/* Quick test auth buttons */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ marginRight: 8 }}
          >
            {loading ? 'Logging in...' : 'Login (test)'}
          </button>
          <button onClick={handleRegister} disabled={loading}>
            {loading ? 'Registering...' : 'Register (test)'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button onClick={handleTestApi} disabled={loading}>
          {loading ? 'Testing...' : 'Test protected API'}
        </button>
        <button
          onClick={handleGetCurrentUser}
          disabled={loading || !token}
          style={{ marginLeft: 8 }}
        >
          {loading ? 'Loading...' : 'Get current user'}
        </button>
        {apiResult && (
          <div style={{ marginTop: 8 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{apiResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
