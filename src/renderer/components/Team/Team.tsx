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
  Table,
} from '@mui/joy';
import { PlusIcon, TypeOutline, User2Icon } from 'lucide-react';
import { useState } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import RenameTeamModal from './RenameTeamModal';

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
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // Get teams list (unchanged)
  const { data: teams, mutate: teamsMutate } = useAPI('teams', ['list']);

  // Expose mutate for members so we can re-fetch after role change
  const { data: members, mutate: membersMutate } = useAPI(
    'teams',
    ['getMembers'],
    {
      teamId: authContext?.team?.id,
    },
  );

  // Simplify errors: show all errors under the "Members" title
  const [roleError, setRoleError] = useState<string | undefined>(undefined);

  // Clear all role errors or add an error text
  function handleSetRoleError(message?: string) {
    if (!message) {
      setRoleError(undefined);
    } else {
      setRoleError(message);
    }
  }

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

  async function handleUpdateRole(userId: string, currentRole: string) {
    // No team selected / invalid input
    const teamId = authContext?.team?.id;
    if (!teamId || !userId) return;

    const newRole = currentRole === 'owner' ? 'member' : 'owner';

    // Clear errors when we start a change
    handleSetRoleError(undefined);

    try {
      const res = await authContext.fetchWithAuth(
        `teams/${teamId}/members/${userId}/role`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: newRole }),
        },
      );

      if (!res.ok) {
        // Try to read JSON or text error body
        let bodyText: string;
        try {
          const json = await res.json();
          bodyText = json && json.detail ? json.detail : JSON.stringify(json);
        } catch {
          bodyText = await res.text();
        }

        handleSetRoleError(bodyText || 'Failed to update role');
        return;
      }

      // success — refetch members so UI updates, clear any errors
      if (membersMutate) membersMutate();
      handleSetRoleError(undefined);
    } catch (e: any) {
      handleSetRoleError(e?.message ?? String(e));
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

        <Stack mt={3} gap={1}>
          <Typography level="title-lg">Team</Typography>
          <Button
            variant="outlined"
            onClick={() => {
              setRenameModalOpen(true);
            }}
          >
            Rename Workspace
          </Button>
          <Button variant="outlined">Set Logo</Button>
        </Stack>

        <Box sx={{ mt: 3 }}>
          <Typography level="title-lg" mb={1}>
            Members: ({members?.members?.length ?? 0})
          </Typography>

          {roleError ? (
            <Box sx={{ mb: 0 }}>
              <Typography level="body-sm" sx={{ color: 'red' }}>
                {roleError}
              </Typography>
            </Box>
          ) : null}

          <Table variant="soft" sx={{ mb: 2 }}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {members?.members?.map((m: any, idx: number) => (
                <tr key={m.user_id ?? m.email ?? idx}>
                  <td>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <User2Icon />
                      <Box>
                        <Typography fontWeight="md">
                          {m?.email ?? '—'}
                        </Typography>
                      </Box>
                    </Stack>
                  </td>
                  <td>{m?.role}</td>
                  <td>
                    <Box
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                    >
                      <Button
                        variant="outlined"
                        onClick={() => handleUpdateRole(m.user_id, m.role)}
                      >
                        {m?.role === 'owner'
                          ? 'Change role to member'
                          : 'Change role to owner'}
                      </Button>

                      {/* Per-member error display removed — all errors shown under the Members title */}
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button startDecorator={<PlusIcon />} variant="soft">
            Invite Member
          </Button>
        </Box>
      </Box>
      <RenameTeamModal
        open={renameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          teamsMutate();
        }}
        teamId={authContext.team?.id || ''}
        currentName={authContext.team?.name || ''}
      />
    </div>
  );
}
