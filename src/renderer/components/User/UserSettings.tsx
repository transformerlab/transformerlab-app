import {
  Badge,
  Box,
  Button,
  List,
  ListItem,
  ListItemContent,
  Typography,
  ListItemButton,
  Stack,
  Modal,
  ModalDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Input,
  FormControl,
  FormLabel,
  Select,
  Sheet,
  Option,
  IconButton,
  Alert,
  Card,
  Chip,
  Table,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy';
import { useState } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { useNotificationsSummary } from 'renderer/lib/useNotificationsSummary';
import { CopyIcon, TrashIcon, PlusIcon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/api-client/urls';
import QuotaReportSection from './QuotaReportSection';
import UserSecretsSection from './UserSecretsSection';
import ProviderSettingsSection from './ProviderSettingsSection';

function PasswordChangeForm({ open, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { fetchWithAuth } = useAuth();

  const handleSave = async () => {
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      const response = await fetchWithAuth('users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update password: ${response.statusText}`);
      }
      console.log('Password updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating password:', error);
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>New Password:</FormLabel>
            <Input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <Input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
            />
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="plain">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="solid">
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

function UserNameChangeForm({
  originalFirstName,
  originalLastName,
  open,
  onClose,
}) {
  const [firstName, setFirstName] = useState(originalFirstName);
  const [lastName, setLastName] = useState(originalLastName);
  const { fetchWithAuth } = useAuth();

  const handleSave = async () => {
    try {
      const response = await fetchWithAuth('users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.statusText}`);
      }

      console.log('User updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Change Name</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>First Name</FormLabel>
            <Input
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>Last Name</FormLabel>
            <Input
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
            />
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="plain">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="solid">
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default function UserSettings(): JSX.Element {
  const authContext = useAuth();
  const [isNameChangeOpen, setIsNameChangeOpen] = useState(false);
  const { data: teams, mutate: teamsMutate } = useAPI('teams', ['list']);
  const { data: userInfo, mutate: userInfoMutate } = useAPI('users', ['me']);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const { data: invitations, mutate: invitationsMutate } = useAPI(
    'invitations',
    ['me'],
    {},
  );
  const notificationsSummary = useNotificationsSummary(null);
  const [activeTab, setActiveTab] = useState<number>(0);

  return (
    <Sheet sx={{ overflowY: 'auto', p: 2 }}>
      <Typography level="h2" mb={2}>
        User Settings
      </Typography>

      <Tabs
        aria-label="User settings tabs"
        value={activeTab}
        onChange={(event, value) => setActiveTab(value as number)}
        sx={{
          mt: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TabList>
          <Tab>Profile</Tab>
          <Tab>Secrets</Tab>
          <Tab>API Keys</Tab>
          <Tab>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ gap: 1 }}
            >
              <span>Team Invitations</span>
              {notificationsSummary.byCategory.teamInvites > 0 && (
                <Chip size="sm" color="danger" variant="soft">
                  {notificationsSummary.byCategory.teamInvites}
                </Chip>
              )}
            </Stack>
          </Tab>
          <Tab>Provider Settings</Tab>
          <Tab>Quota</Tab>
        </TabList>

        {/* Profile Tab */}
        <TabPanel
          value={0}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <Typography level="title-lg" mt={1}>
            User Profile:
          </Typography>
          <Stack gap={1} mt={1} maxWidth={400}>
            <Typography>
              Name:{' '}
              <b>
                {userInfo?.first_name} {userInfo?.last_name}
              </b>
            </Typography>
            <Typography>
              Email: <b>{userInfo?.email}</b>
            </Typography>
            <Button
              variant="outlined"
              onClick={() => setIsNameChangeOpen(true)}
            >
              Change Name
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setIsPasswordChangeOpen(true);
              }}
            >
              Change Password
            </Button>
            <PasswordChangeForm
              open={isPasswordChangeOpen}
              onClose={() => setIsPasswordChangeOpen(false)}
            />
          </Stack>
          <UserNameChangeForm
            open={isNameChangeOpen}
            onClose={() => {
              setIsNameChangeOpen(false);
              userInfoMutate();
            }}
            originalFirstName={userInfo?.first_name || ''}
            originalLastName={userInfo?.last_name || ''}
          />
          <Box mt={4}>
            <Typography level="title-lg">Teams you belong to:</Typography>
            {teams?.teams && (
              <List>
                {teams.teams.map((team: any) => (
                  <ListItem key={team.id}>
                    <ListItemButton selected={authContext.team?.id === team.id}>
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
        </TabPanel>

        {/* Secrets Tab */}
        <TabPanel
          value={1}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <UserSecretsSection />
        </TabPanel>

        {/* API Keys Tab */}
        <TabPanel
          value={2}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <ApiKeysSection teams={teams?.teams || []} />
        </TabPanel>

        {/* Team Invitations Tab */}
        <TabPanel
          value={3}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <TeamInvitationsSection
            invitations={invitations?.invitations || []}
            onRefresh={invitationsMutate}
          />
        </TabPanel>

        {/* Provider Settings Tab */}
        <TabPanel
          value={4}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <ProviderSettingsSection />
        </TabPanel>

        {/* Quota Tab */}
        <TabPanel
          value={5}
          sx={{
            p: 2,
            overflowY: 'auto',
          }}
        >
          <QuotaReportSection />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}

function ApiKeysSection({ teams }: { teams: any[] }) {
  const { fetchWithAuth } = useAuth();
  const { data: apiKeys, mutate: mutateApiKeys } = useAPI('auth', [
    'apiKeys',
    'list',
  ]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateKey = async () => {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      const response = await fetchWithAuth(
        getAPIFullPath('auth', ['apiKeys', 'create'], {}) || '',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newKeyName || null,
            team_id: selectedTeamId || null,
            expires_in_days: expiresInDays || null,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        setErrorMessage(
          `Failed to create API key: ${error.detail || response.statusText}`,
        );
        setIsCreating(false);
        return;
      }

      const data = await response.json();
      setCreatedKey(data);
      setNewKeyName('');
      setSelectedTeamId(null);
      setExpiresInDays(null);
      setIsCreateModalOpen(false); // Close modal on success
      setIsCreating(false);
      mutateApiKeys();
    } catch (error) {
      console.error('Error creating API key:', error);
      setErrorMessage('Failed to create API key. Please try again.');
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this API key? This action cannot be undone.',
      )
    ) {
      return;
    }

    try {
      const response = await fetchWithAuth(
        getAPIFullPath('auth', ['apiKeys', 'delete'], { key_id: keyId }) || '',
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const error = await response.json();
        alert(
          `Failed to delete API key: ${error.detail || response.statusText}`,
        );
        return;
      }

      mutateApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      alert('Failed to delete API key');
    }
  };

  const handleToggleActive = async (keyId: string, currentStatus: boolean) => {
    try {
      const response = await fetchWithAuth(
        getAPIFullPath('auth', ['apiKeys', 'update'], { key_id: keyId }) || '',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_active: !currentStatus,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        alert(
          `Failed to update API key: ${error.detail || response.statusText}`,
        );
        return;
      }

      mutateApiKeys();
    } catch (error) {
      console.error('Error updating API key:', error);
      alert('Failed to update API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Box mt={4}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography level="title-lg">API Keys</Typography>
        <Button
          startDecorator={<PlusIcon size={16} />}
          onClick={() => {
            setIsCreateModalOpen(true);
            setErrorMessage(null); // Clear any previous errors
          }}
        >
          Create API Key
        </Button>
      </Stack>

      {createdKey && (
        <Alert
          color="success"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton
              size="sm"
              variant="plain"
              onClick={() => setCreatedKey(null)}
            >
              ×
            </IconButton>
          }
        >
          <Typography level="title-sm" mb={1}>
            API Key Created Successfully!
            <br />
            <Typography level="body-sm" mb={2}>
              <strong>Important:</strong> Copy this key now. You won't be able
              to see it again.
            </Typography>
          </Typography>
          <Card
            variant="outlined"
            sx={{ bgcolor: 'background.level1', p: 1, display: 'inline-block' }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Input
                value={createdKey.api_key}
                readOnly
                sx={{
                  fontFamily: 'monospace',
                  fontSize: 'sm',
                  minWidth: `${Math.max(createdKey.api_key?.length || 0, 40) * 1.1}ch`,
                  '& input': {
                    overflow: 'visible',
                    textOverflow: 'clip',
                    whiteSpace: 'nowrap',
                  },
                }}
                endDecorator={
                  <IconButton
                    size="sm"
                    onClick={() => copyToClipboard(createdKey.api_key)}
                  >
                    <CopyIcon size={16} />
                  </IconButton>
                }
              />
            </Stack>
          </Card>
        </Alert>
      )}

      {apiKeys && apiKeys.length === 0 ? (
        <Typography level="body-md" color="neutral">
          No API keys created yet. Create one to get started.
        </Typography>
      ) : (
        <List>
          {Array.isArray(apiKeys) &&
            apiKeys.map((key: any) => (
              <ListItem key={key.id}>
                <Card variant="outlined" sx={{ width: '100%', p: 2 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                  >
                    <Box sx={{ flex: 1 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={1}
                      >
                        <Typography level="title-md">
                          {key.name || 'Unnamed Key'}
                        </Typography>
                        <Chip
                          size="sm"
                          color={key.is_active ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {key.is_active ? 'Active' : 'Inactive'}
                        </Chip>
                      </Stack>
                      <Typography
                        level="body-sm"
                        sx={{ fontFamily: 'monospace' }}
                        mb={1}
                      >
                        {key.key_prefix}
                      </Typography>
                      <Stack direction="row" spacing={2} mb={1}>
                        <Typography level="body-xs" color="neutral">
                          Team: {key.team_name || 'All teams'}
                        </Typography>
                        <Typography level="body-xs" color="neutral">
                          Created: {formatDate(key.created_at)}
                        </Typography>
                        {key.last_used_at && (
                          <Typography level="body-xs" color="neutral">
                            Last used: {formatDate(key.last_used_at)}
                          </Typography>
                        )}
                        {key.expires_at && (
                          <Typography level="body-xs" color="neutral">
                            Expires: {formatDate(key.expires_at)}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="sm"
                        variant="outlined"
                        color={key.is_active ? 'neutral' : 'success'}
                        onClick={() =>
                          handleToggleActive(key.id, key.is_active)
                        }
                      >
                        {key.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <IconButton
                        size="sm"
                        variant="outlined"
                        color="danger"
                        onClick={() => handleDeleteKey(key.id)}
                      >
                        <TrashIcon size={16} />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Card>
              </ListItem>
            ))}
        </List>
      )}

      <Modal
        open={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setErrorMessage(null);
          setNewKeyName('');
          setSelectedTeamId(null);
          setExpiresInDays(null);
        }}
      >
        <ModalDialog>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogContent>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Name (optional)</FormLabel>
              <Input
                placeholder="e.g., Production API Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                fullWidth
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Team Scope (optional)</FormLabel>
              <Select
                value={selectedTeamId || ''}
                onChange={(_, value) =>
                  setSelectedTeamId(value as string | null)
                }
                placeholder="All teams"
              >
                <Option value="">All teams</Option>
                {teams.map((team: any) => (
                  <Option key={team.id} value={team.id}>
                    {team.name}
                  </Option>
                ))}
              </Select>
              <Typography level="body-xs" color="neutral" mt={0.5}>
                If selected, this key will only work for the chosen team. If
                left empty, the key will work for all your teams.
              </Typography>
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Expires in (days, optional)</FormLabel>
              <Input
                type="number"
                placeholder="e.g., 90 (leave empty for no expiration)"
                value={expiresInDays || ''}
                onChange={(e) =>
                  setExpiresInDays(
                    e.target.value ? parseInt(e.target.value) : null,
                  )
                }
                fullWidth
              />
            </FormControl>
          </DialogContent>
          {errorMessage && (
            <Alert color="danger" sx={{ mt: 2 }}>
              <Typography level="body-sm">{errorMessage}</Typography>
            </Alert>
          )}
          <DialogActions>
            <Button
              onClick={() => {
                setIsCreateModalOpen(false);
                setErrorMessage(null);
                setNewKeyName('');
                setSelectedTeamId(null);
                setExpiresInDays(null);
              }}
              variant="plain"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              variant="solid"
              loading={isCreating}
              disabled={isCreating}
            >
              Create
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}

function TeamInvitationsSection({
  invitations,
  onRefresh,
}: {
  invitations: any[];
  onRefresh?: () => void;
}) {
  const { fetchWithAuth } = useAuth();

  const handleAccept = async (invitationId: string) => {
    try {
      const response = await fetchWithAuth(
        `invitations/${invitationId}/accept`,
        {
          method: 'POST',
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(
          'Failed to accept invitation',
          error?.detail || response.statusText,
        );
        return;
      }
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      const response = await fetchWithAuth(
        `invitations/${invitationId}/reject`,
        {
          method: 'POST',
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(
          'Failed to reject invitation',
          error?.detail || response.statusText,
        );
        return;
      }
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('Error rejecting invitation:', error);
    }
  };

  return (
    <Box mt={4}>
      <Typography level="title-lg" mb={1}>
        Team Invitations
      </Typography>
      {(!invitations || invitations.length === 0) && (
        <Typography level="body-sm" color="neutral">
          You have no pending team invitations.
        </Typography>
      )}
      {invitations && invitations.length > 0 && (
        <Table variant="soft" sx={{ mt: 1 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Invited By</th>
              <th>Role</th>
              <th>Status</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation: any) => (
              <tr key={invitation.id}>
                <td>
                  <Typography level="body-sm">
                    {invitation.team_name || invitation.team_id}
                  </Typography>
                </td>
                <td>
                  <Typography level="body-sm">
                    {invitation.invited_by_email}
                  </Typography>
                </td>
                <td>
                  <Chip size="sm" variant="soft">
                    {invitation.role}
                  </Chip>
                </td>
                <td>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={
                      invitation.status === 'pending'
                        ? 'primary'
                        : invitation.status === 'accepted'
                          ? 'success'
                          : invitation.status === 'rejected' ||
                              invitation.status === 'cancelled'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {invitation.status}
                  </Chip>
                </td>
                <td>
                  <Typography level="body-xs">
                    {invitation.expires_at
                      ? new Date(invitation.expires_at).toLocaleDateString()
                      : '—'}
                  </Typography>
                </td>
                <td>
                  {invitation.status === 'pending' && (
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="flex-end"
                    >
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => handleAccept(invitation.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outlined"
                        color="neutral"
                        onClick={() => handleReject(invitation.id)}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Box>
  );
}
