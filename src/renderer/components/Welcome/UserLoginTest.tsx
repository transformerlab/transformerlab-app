import { Button } from '@mui/joy';
import React, { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';

/*
  Minimal in-file auth utilities and request helpers.
  - getAccessToken / updateAccessToken / logoutUser
  - simple subscription so components re-render on auth change
  - handleRefresh and fetchWithAuth as in your example
*/

// --- React component ---
export default function UserLoginTest(): JSX.Element {
  const authContext = useAuth();
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  async function handleTestApi() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await authContext.fetchWithAuth(
        'test-users/authenticated-route',
        {
          method: 'GET',
        },
      );
      const text = await res.text();
      setApiResult(`Status: ${res.status} — Body: ${text}`);
    } catch (e: any) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetCurrentUser() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await authContext.fetchWithAuth('users/me', {
        method: 'GET',
      });
      const data = await res.json();
      setApiResult(`Status: ${res.status} — Body: ${JSON.stringify(data)}`);
    } catch (e: any) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await authContext.fetchWithAuth('auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });
      const data = await res.json();
      setApiResult(`Status: ${res.status} — Body: ${JSON.stringify(data)}`);
    } catch (e: any) {
      setApiResult(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div>
        <strong>Login status:</strong>{' '}
        {authContext?.isAuthenticated ? 'Logged in' : 'Not logged in'}
      </div>

      {authContext?.isAuthenticated ? null : (
        <div>
          {/* Quick test auth buttons */}
          <Button
            type="button"
            onClick={authContext.login}
            disabled={loading}
            style={{ marginRight: 8 }}
          >
            {loading ? 'Logging in...' : 'Login (test)'}
          </Button>
          <Button
            type="button"
            onClick={() => handleRegister()}
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register (test)'}
          </Button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Button
          type="button"
          onClick={() => handleTestApi()}
          disabled={loading}
        >
          {loading ? 'Testing...' : 'Test protected API'}
        </Button>
        <Button
          type="button"
          onClick={() => handleGetCurrentUser()}
          disabled={loading || !authContext?.isAuthenticated}
          style={{ marginLeft: 8 }}
        >
          {loading ? 'Loading...' : 'Get current user'}
        </Button>
        {apiResult && (
          <div style={{ marginTop: 8 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{apiResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
