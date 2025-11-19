import {
  Box,
  Button,
  List,
  ListItem,
  ListItemContent,
  Typography,
  Input,
  ListItemButton,
  Option,
  Select,
  Modal,
  ModalDialog,
  ModalClose,
  Stack,
  ListItemDecorator,
} from '@mui/joy';
import { PlusIcon, User2Icon } from 'lucide-react';
import { useState } from 'react';
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
  const [loading, setLoading] = useState<boolean>(false);
  const [newTeamName, setNewTeamName] = useState<string>('');
  const [openNewTeamModal, setOpenNewTeamModal] = useState<boolean>(false);
  const { data: teams, mutate: teamsMutate } = useAPI('teams', ['list']);
  const { data: members } = useAPI('teams', ['getMembers'], {
    teamId: authContext?.team?.id,
  });

  async function handleNewTeam() {
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
        return;
      }

      const data = await res.json();
      setNewTeamName('');

      teamsMutate();
    } catch (e: any) {
      console.error('Error creating team:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Box>
        <Typography level="title-lg" mb={1}>
          Current Workspace:
        </Typography>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ width: '100%' }}
        >
          <Select
            value={authContext.team?.id ?? ''}
            onChange={(_, value) => {
              const selectedId = value as string;
              const selectedTeam = teams?.teams.find(
                (t: any) => t.id === selectedId,
              );
              if (selectedTeam) {
                authContext.setTeam({
                  id: selectedTeam.id,
                  name: selectedTeam.name,
                });
              }
            }}
            disabled={loading}
            aria-label="Select workspace"
            sx={{ minWidth: 300 }}
          >
            {teams?.teams.map((team: any) => (
              <Option key={team.id} value={team.id}>
                {team.name}
                {/* — {team.id} */}
              </Option>
            ))}
          </Select>

          <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              onClick={() => setOpenNewTeamModal(true)}
              disabled={loading}
              variant="soft"
              startDecorator={<PlusIcon />}
            >
              New Workspace
            </Button>

            <Modal
              open={openNewTeamModal}
              onClose={() => setOpenNewTeamModal(false)}
            >
              <ModalDialog
                aria-labelledby="new-workspace-title"
                sx={{ minWidth: 320 }}
              >
                <ModalClose />
                <Typography id="new-workspace-title" level="h4">
                  New Workspace Name
                </Typography>

                <Box sx={{ mt: 2 }}>
                  <Input
                    placeholder="Workspace name"
                    value={newTeamName}
                    onChange={(e: any) => setNewTeamName(e.target.value)}
                    disabled={loading}
                    aria-label="New workspace name"
                    size="sm"
                    autoFocus
                  />
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'flex-end',
                    mt: 2,
                  }}
                >
                  <Button
                    variant="plain"
                    onClick={() => setOpenNewTeamModal(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      // call existing handler and close the dialog
                      handleNewTeam();
                      setOpenNewTeamModal(false);
                    }}
                    disabled={loading || !newTeamName.trim()}
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </Button>
                </Box>
              </ModalDialog>
            </Modal>
          </Box>
        </Stack>
        <Box sx={{ mt: 3 }}>
          <Typography level="title-lg" mb={1}>
            Members:
          </Typography>

          <List>
            {members?.members?.map((m: any, idx: number) => (
              <ListItem key={m.id ?? m.email ?? idx}>
                <ListItemButton>
                  <ListItemDecorator>
                    <User2Icon />
                  </ListItemDecorator>
                  <ListItemContent>
                    <Typography fontWeight="md">{m?.email}</Typography>
                    {m.email && (
                      <Typography level="body2" textColor="neutral.500">
                        Role: {m?.role}
                      </Typography>
                    )}
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
            <ListItem>
              <Typography level="body2" textColor="neutral.500">
                Total Members: {members?.members?.length ?? 0}
              </Typography>
            </ListItem>
          </List>
          <Button startDecorator={<PlusIcon />} variant="soft">
            Invite Member (Coming Soon)
          </Button>
        </Box>
      </Box>
    </div>
  );
}
