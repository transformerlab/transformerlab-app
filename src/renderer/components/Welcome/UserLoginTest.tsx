import {
  Box,
  Button,
  List,
  ListItem,
  ListItemContent,
  Typography,
  Input,
  ListItemButton,
} from '@mui/joy';
import { TypeOutline } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';

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
  const [newTeamName, setNewTeamName] = useState<string>('');
  const { data: teams, mutate: teamsMutate } = useAPI('teams', ['list']);
  const { data: userInfo } = useAPI('users', ['me']);

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

  async function handleNewTeam() {
    setApiResult(null);
    setLoading(true);
    try {
      const res = await authContext.fetchWithAuth('teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newTeamName }),
      });

      if (!res.ok) {
        // Try to read JSON or text error body
        let bodyText: string;
        try {
          const json = await res.json();
          bodyText = JSON.stringify(json);
        } catch {
          bodyText = await res.text();
        }
        setApiResult(`Error: ${res.status} — ${bodyText}`);
        return;
      }

      const data = await res.json();
      setApiResult(`Created team: ${JSON.stringify(data)}`);
      setNewTeamName('');

      teamsMutate();
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
            onClick={() => authContext.login('test@example.com', 'password123')}
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
        {apiResult && (
          <div style={{ marginTop: 8 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{apiResult}</pre>
          </div>
        )}
      </div>

      <Box>
        <Typography level="h4" mt={3}>
          User Info:
        </Typography>
        {userInfo && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(userInfo, null, 2)}
          </pre>
        )}
      </Box>

      <Box>
        <Typography level="h4" mt={3}>
          Teams:
        </Typography>
        {/* {JSON.stringify(authContext, null, 2)} */}
        {teams?.teams && (
          <List>
            {teams.teams.map((team: any) => (
              <ListItem key={team.id}>
                <ListItemButton
                  onClick={() => {
                    authContext.setTeam({ id: team.id, name: team.name });
                  }}
                  selected={authContext.team?.id === team.id}
                >
                  <ListItemContent>
                    <Typography level="title-md">
                      {team.name}
                      {authContext.team?.id === team.id ? ' (selected)' : ''}
                    </Typography>
                    <Typography level="body-xs">{team.id}</Typography>
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Input
            placeholder="New team name"
            value={newTeamName}
            onChange={(e: any) => setNewTeamName(e.target.value)}
            disabled={loading}
            aria-label="New team name"
            size="sm"
          />
          <Button
            onClick={() => handleNewTeam()}
            disabled={loading || !newTeamName.trim()}
          >
            {loading ? 'Creating...' : 'Create a New Team'}
          </Button>
        </div>
      </Box>
    </div>
  );
}
