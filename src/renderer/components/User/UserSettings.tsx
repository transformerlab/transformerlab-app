import {
  Box,
  Button,
  List,
  ListItem,
  ListItemContent,
  Typography,
  ListItemButton,
  Stack,
} from '@mui/joy';
import { useState } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';

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

  return (
    <div>
      <div>
        <strong>Login status:</strong>{' '}
        {authContext?.isAuthenticated ? 'Logged in' : 'Not logged in'}
      </div>

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

      {/* <Box>
        <Typography level="h4" mt={3}>
          User Info:
        </Typography>
        {userInfo && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(userInfo, null, 2)}
          </pre>
        )}
      </Box> */}
      <Typography level="title-lg" mt={3}>
        User Profile
      </Typography>
      <Stack gap={3} mt={3} maxWidth={400}>
        <Button variant="outlined">Change Name</Button>
        <Button variant="outlined">Change Profile Icon</Button>
        <Button variant="outlined">Change Password</Button>
      </Stack>
      <Box>
        <Typography level="title-lg" mt={3}>
          Workspaces you belong to:
        </Typography>
        {/* {JSON.stringify(authContext, null, 2)} */}
        {teams?.teams && (
          <List>
            {teams.teams.map((team: any) => (
              <ListItem key={team.id}>
                <ListItemButton
                  // onClick={() => {
                  //   authContext.setTeam({ id: team.id, name: team.name });
                  // }}
                  selected={authContext.team?.id === team.id}
                >
                  <ListItemContent>
                    <Typography level="title-md">
                      {team.name}
                      {authContext.team?.id === team.id ? ' (current)' : ''}
                    </Typography>
                    <Typography level="body-xs">{team.id}</Typography>
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </div>
  );
}
