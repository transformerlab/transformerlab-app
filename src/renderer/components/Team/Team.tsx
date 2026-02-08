import {
  Box,
  Button,
  Typography,
  Input,
  Option,
  Select,
  Modal,
  ModalDialog,
  ModalClose,
  Stack,
  Table,
  Sheet,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  FormControl,
  FormLabel,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy';
import {
  NetworkIcon,
  PlusIcon,
  ServerIcon,
  User2Icon,
  ActivityIcon,
  BarChart3Icon,
  GithubIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import RenameTeamModal from './RenameTeamModal';
import InviteUserModal from './InviteUserModal';
import ProviderDetailsModal from './ProviderDetailsModal';
import QuotaSettingsSection from './QuotaSettingsSection';
import TeamSecretsSection from './TeamSecretsSection';
import SshKeySection from './SshKeySection';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

/*
  Minimal in-file auth utilities and request helpers.
  - getAccessToken / updateAccessToken / logoutUser
  - simple subscription so components re-render on auth change
  - handleRefresh and fetchWithAuth as in your example
*/

// --- React component ---
export default function UserLoginTest(): JSX.Element {
  const navigate = useNavigate();
  const authContext = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [newTeamName, setNewTeamName] = useState<string>('');
  const [newTeamLogo, setNewTeamLogo] = useState<File | null>(null);
  const [newTeamLogoPreview, setNewTeamLogoPreview] = useState<string | null>(
    null,
  );
  const [openNewTeamModal, setOpenNewTeamModal] = useState<boolean>(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [openInviteModal, setOpenInviteModal] = useState<boolean>(false);
  const [openProviderDetailsModal, setOpenProviderDetailsModal] =
    useState<boolean>(false);
  const [providerId, setProviderId] = useState<string>('');
  const [checkingProviderId, setCheckingProviderId] = useState<string | null>(
    null,
  );
  const [providerCheckStatus, setProviderCheckStatus] = useState<
    Record<string, boolean | null>
  >({});
  const [githubPAT, setGithubPAT] = useState<string>('');
  const [githubPATMasked, setGithubPATMasked] = useState<string>('');
  const [githubPATExists, setGithubPATExists] = useState<boolean>(false);
  const [savingPAT, setSavingPAT] = useState<boolean>(false);
  const [loadingPAT, setLoadingPAT] = useState<boolean>(true);
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null);
  const [openSetLogoModal, setOpenSetLogoModal] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<number>(0);

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
  const { data: invitations, mutate: invitationsMutate } = useAPI(
    'teams',
    ['getInvitations'],
    {
      teamId: authContext?.team?.id,
    },
  );

  // Get compute_provider list (unchanged)
  const {
    data: providers,
    mutate: providersMutate,
    isLoading: providersLoading,
  } = useAPI('compute_provider', ['list']);

  // Simplify errors: show all errors under the "Members" title
  const [roleError, setRoleError] = useState<string | undefined>(undefined);

  const iAmOwner = members?.members?.some((m: any) => {
    return m.user_id === authContext.user?.id && m.role === 'owner';
  });

  // Re-fetch providers whenever the selected team changes
  useEffect(() => {
    providersMutate();
  }, [authContext?.team?.id]);

  // Fetch GitHub PAT when team changes
  useEffect(() => {
    const fetchGitHubPAT = async () => {
      if (!authContext?.team?.id) {
        setLoadingPAT(false);
        return;
      }
      setLoadingPAT(true);
      try {
        const res = await authContext.fetchWithAuth(
          `teams/${authContext.team.id}/github_pat`,
          { method: 'GET' },
        );
        if (res.ok) {
          const data = await res.json();
          setGithubPATExists(data.pat_exists || false);
          setGithubPATMasked(data.masked_pat || '');
          if (!data.pat_exists) {
            setGithubPAT('');
          }
        }
      } catch (e: any) {
        console.error('Error fetching GitHub PAT:', e);
      } finally {
        setLoadingPAT(false);
      }
    };
    fetchGitHubPAT();
  }, [authContext?.team?.id]);

  // Fetch team logo when team changes
  useEffect(() => {
    const fetchTeamLogo = async () => {
      if (!authContext?.team?.id) {
        setTeamLogo(null);
        return;
      }
      try {
        const res = await authContext.fetchWithAuth(
          `teams/${authContext.team.id}/logo`,
          { method: 'GET' },
        );
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setTeamLogo(url);
        } else {
          setTeamLogo(null);
        }
      } catch (e: any) {
        // Logo not found is expected if no logo is set
        setTeamLogo(null);
      }
    };
    fetchTeamLogo();
  }, [authContext?.team?.id]);

  // Fetch logos for all teams for the dropdown
  useEffect(() => {
    if (!teams?.teams || !authContext?.fetchWithAuth) return;

    const fetchLogos = async () => {
      const logoMap: Record<string, string> = {};
      const promises = teams.teams.map(async (team: any) => {
        try {
          const res = await authContext.fetchWithAuth(`teams/${team.id}/logo`, {
            method: 'GET',
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            logoMap[team.id] = url;
          }
        } catch (e) {
          // Logo not found is expected if no logo is set
        }
      });
      await Promise.all(promises);
      setTeamLogos(logoMap);
    };

    fetchLogos();
  }, [teams?.teams, authContext?.fetchWithAuth]);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      Object.values(teamLogos).forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [teamLogos]);

  const handleSaveGitHubPAT = async () => {
    if (!authContext?.team?.id || !iAmOwner) return;
    setSavingPAT(true);
    try {
      const res = await authContext.fetchWithAuth(
        `teams/${authContext.team.id}/github_pat`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pat: githubPAT || '' }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        // Refresh PAT display
        const fetchRes = await authContext.fetchWithAuth(
          `teams/${authContext.team.id}/github_pat`,
          { method: 'GET' },
        );
        if (fetchRes.ok) {
          const fetchData = await fetchRes.json();
          setGithubPATExists(fetchData.pat_exists || false);
          setGithubPATMasked(fetchData.masked_pat || '');
          if (!fetchData.pat_exists) {
            setGithubPAT('');
          }
        }
      }
    } catch (e: any) {
      console.error('Error saving GitHub PAT:', e);
      alert(`Failed to save GitHub PAT: ${e?.message || String(e)}`);
    } finally {
      setSavingPAT(false);
    }
  };

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
      const formData = new FormData();
      formData.append('name', newTeamName);
      if (newTeamLogo) {
        formData.append('logo', newTeamLogo);
      }

      const res = await authContext.fetchWithAuth('teams', {
        method: 'POST',
        body: formData,
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
      setNewTeamLogo(null);
      setNewTeamLogoPreview(null);

      teamsMutate();

      // If logo was uploaded, fetch it for the new team
      if (newTeamLogo && data.id) {
        try {
          const logoRes = await authContext.fetchWithAuth(
            `teams/${data.id}/logo`,
            { method: 'GET' },
          );
          if (logoRes.ok) {
            const blob = await logoRes.blob();
            const url = URL.createObjectURL(blob);
            setTeamLogos((prev) => ({
              ...prev,
              [data.id]: url,
            }));
          }
        } catch (e) {
          // Logo might not be ready yet, ignore
        }
      }
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

      // Switching role might change what you can see from providers
      if (providersMutate) providersMutate();

      handleSetRoleError(undefined);
    } catch (e: any) {
      handleSetRoleError(e?.message ?? String(e));
    }
  }

  async function handleDeleteProvider(id: string, name: string) {
    // Confirm deletion
    // eslint-disable-next-line no-alert
    if (
      !confirm(
        `Are you sure you want to delete the provider "${name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const res = await authContext.fetchWithAuth(
        chatAPI.getAPIFullPath('compute_provider', ['delete'], {
          providerId: id,
        }),
        {
          method: 'DELETE',
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          detail: 'Failed to delete provider',
        }));
        // eslint-disable-next-line no-alert
        alert(
          `Failed to delete provider: ${errorData.detail || 'Unknown error'}`,
        );
        return;
      }

      // Success — refetch providers to update UI
      if (providersMutate) providersMutate();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(`Error deleting provider: ${e?.message ?? String(e)}`);
    }
  }

  async function handleCheckProvider(id: string) {
    setCheckingProviderId(id);
    setProviderCheckStatus((prev) => ({ ...prev, [id]: null }));

    try {
      const res = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.ComputeProvider.Check(id),
        {
          method: 'GET',
        },
      );

      if (!res.ok) {
        setProviderCheckStatus((prev) => ({ ...prev, [id]: false }));
        return;
      }

      const data = await res.json();
      setProviderCheckStatus((prev) => ({
        ...prev,
        [id]: data.status === true,
      }));
    } catch (e: any) {
      setProviderCheckStatus((prev) => ({ ...prev, [id]: false }));
    } finally {
      setCheckingProviderId(null);
    }
  }

  return (
    <Sheet sx={{ overflowY: 'auto', p: 2 }}>
      <Typography level="h2" mb={2}>
        Team Settings
      </Typography>
      <Box>
        <Typography level="title-lg" mb={1}>
          Current Team:
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" maxWidth={500}>
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
            aria-label="Select team"
            sx={{ minWidth: 300 }}
          >
            {teams?.teams.map((team: any) => {
              const teamLogoUrl = teamLogos[team.id];
              return (
                <Option key={team.id} value={team.id}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {teamLogoUrl ? (
                      <Box
                        component="img"
                        src={teamLogoUrl}
                        alt={`${team.name} logo`}
                        sx={{
                          width: 20,
                          height: 20,
                          objectFit: 'contain',
                          borderRadius: 'sm',
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: 'sm',
                          bgcolor: 'neutral.200',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User2Icon size={12} />
                      </Box>
                    )}
                    <Typography>{team.name}</Typography>
                  </Stack>
                </Option>
              );
            })}
          </Select>

          <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              onClick={() => setOpenNewTeamModal(true)}
              disabled={loading}
              variant="soft"
              startDecorator={<PlusIcon />}
            >
              New Team
            </Button>

            <Modal
              open={openNewTeamModal}
              onClose={() => {
                setOpenNewTeamModal(false);
                setNewTeamLogo(null);
                setNewTeamLogoPreview(null);
              }}
            >
              <ModalDialog
                aria-labelledby="new-team-title"
                sx={{ minWidth: 320 }}
              >
                <ModalClose />
                <Typography id="new-team-title" level="h4">
                  New Team
                </Typography>

                <Box sx={{ mt: 2 }}>
                  <FormControl>
                    <FormLabel>Team Name</FormLabel>
                    <Input
                      placeholder="Team name"
                      value={newTeamName}
                      onChange={(e: any) => setNewTeamName(e.target.value)}
                      disabled={loading}
                      aria-label="New team name"
                      size="sm"
                      autoFocus
                    />
                  </FormControl>
                </Box>

                <Box sx={{ mt: 2 }}>
                  <FormControl>
                    <FormLabel>Team Logo (optional)</FormLabel>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      {newTeamLogoPreview && (
                        <Box
                          component="img"
                          src={newTeamLogoPreview}
                          alt="Logo preview"
                          sx={{
                            width: 64,
                            height: 64,
                            objectFit: 'contain',
                            borderRadius: 'sm',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      )}
                      <Button
                        component="label"
                        variant="outlined"
                        size="sm"
                        disabled={loading}
                      >
                        {newTeamLogo ? 'Change Logo' : 'Upload Logo'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={(e: any) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setNewTeamLogo(file);
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewTeamLogoPreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </Button>
                      {newTeamLogo && (
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => {
                            setNewTeamLogo(null);
                            setNewTeamLogoPreview(null);
                          }}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      )}
                    </Box>
                  </FormControl>
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
                    onClick={() => {
                      setOpenNewTeamModal(false);
                      setNewTeamLogo(null);
                      setNewTeamLogoPreview(null);
                    }}
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

        <Stack mt={3} gap={1} maxWidth={500}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {teamLogo && (
              <Box
                component="img"
                src={teamLogo}
                alt="Team logo"
                sx={{
                  width: 64,
                  height: 64,
                  objectFit: 'contain',
                  borderRadius: 'sm',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            )}
            {!teamLogo && (
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 'sm',
                  bgcolor: 'neutral.200',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User2Icon size={32} />
              </Box>
            )}
            <Stack gap={1}>
              <Button
                variant="outlined"
                onClick={() => {
                  setRenameModalOpen(true);
                }}
                disabled={!iAmOwner}
              >
                Rename Team
              </Button>
              <Button
                variant="outlined"
                startDecorator={<BarChart3Icon />}
                onClick={() => navigate('/team/usage-report')}
                disabled={!iAmOwner}
              >
                Usage Report {!iAmOwner ? '(Only owners can view)' : ''}
              </Button>
              <Button
                variant="outlined"
                onClick={() => setOpenSetLogoModal(true)}
                disabled={!iAmOwner}
              >
                {teamLogo ? 'Change Logo' : 'Set Logo'}
              </Button>
              {teamLogo && (
                <Button
                  variant="outlined"
                  color="danger"
                  onClick={async () => {
                    if (!authContext?.team?.id || !iAmOwner) return;
                    try {
                      const res = await authContext.fetchWithAuth(
                        `teams/${authContext.team.id}/logo`,
                        { method: 'DELETE' },
                      );
                      if (res.ok) {
                        setTeamLogo(null);
                        // Remove logo from teamLogos map
                        const teamId = authContext.team?.id;
                        if (teamId) {
                          setTeamLogos((prev) => {
                            const updated = { ...prev };
                            delete updated[teamId];
                            return updated;
                          });
                        }
                      }
                    } catch (e: any) {
                      console.error('Error deleting logo:', e);
                    }
                  }}
                  disabled={!iAmOwner}
                >
                  Remove Logo
                </Button>
              )}
            </Stack>
          </Box>
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
          <Button
            startDecorator={<PlusIcon />}
            onClick={() => setOpenInviteModal(true)}
            variant="soft"
            disabled={!iAmOwner}
          >
            Invite Member {!iAmOwner ? '(Only owners can invite members)' : ''}
          </Button>
        </Box>
        {iAmOwner && (
          <Box sx={{ mt: 3 }}>
            <Typography level="title-lg" mb={1}>
              Invitations
            </Typography>
            {(!invitations?.invitations ||
              invitations.invitations.length === 0) && (
              <Typography level="body-sm" color="neutral">
                No invitations have been sent for this team yet.
              </Typography>
            )}
            {invitations?.invitations && invitations.invitations.length > 0 && (
              <Table variant="soft" sx={{ mb: 2 }}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Invited By</th>
                    <th>Expires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.invitations.map((invitation: any) => (
                    <tr key={invitation.id}>
                      <td>
                        <Typography level="body-sm">
                          {invitation.email}
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
                        <Typography level="body-sm">
                          {invitation.invited_by_email}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {invitation.expires_at
                            ? new Date(
                                invitation.expires_at,
                              ).toLocaleDateString()
                            : '—'}
                        </Typography>
                      </td>
                      <td>
                        {invitation.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={async () => {
                              if (!authContext?.team?.id) return;
                              try {
                                const res = await authContext.fetchWithAuth(
                                  `teams/${authContext.team.id}/invitations/${invitation.id}`,
                                  {
                                    method: 'DELETE',
                                  },
                                );
                                if (res.ok && invitationsMutate) {
                                  invitationsMutate();
                                }
                              } catch (e: any) {
                                console.error(
                                  'Error cancelling invitation:',
                                  e,
                                );
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Box>
        )}
        <Box sx={{ mt: 4 }}>
          <Typography level="title-lg" mb={1} startDecorator={<ServerIcon />}>
            Compute Providers: ({providers?.length ?? 0})
          </Typography>

          <Table
            variant="soft"
            sx={{
              mb: 2,
              '& th, & td': { padding: '8px 12px' },
              width: '100%',
              tableLayout: 'auto',
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 'auto' }}>Name</th>
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>Status</th>
                <th
                  style={{
                    width: 'auto',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(providers) &&
                providers?.map((provider: any) => {
                  const status = providerCheckStatus[provider.id];
                  const isChecking = checkingProviderId === provider.id;

                  return (
                    <tr key={provider.id}>
                      <td>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <NetworkIcon size={16} />
                          <Typography fontWeight="md" level="body-sm">
                            {provider?.name ?? '—'}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {provider?.type}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" alignItems="center" gap={0.5}>
                          {isChecking ? (
                            <CircularProgress size="sm" />
                          ) : status === true ? (
                            <Chip
                              variant="soft"
                              color="success"
                              size="sm"
                              sx={{ fontSize: '0.7rem', px: 0.5 }}
                            >
                              Active
                            </Chip>
                          ) : status === false ? (
                            <Chip
                              variant="soft"
                              color="danger"
                              size="sm"
                              sx={{ fontSize: '0.7rem', px: 0.5 }}
                            >
                              Inactive
                            </Chip>
                          ) : (
                            <Chip
                              variant="soft"
                              color="neutral"
                              size="sm"
                              sx={{ fontSize: '0.7rem', px: 0.5 }}
                            >
                              Unknown
                            </Chip>
                          )}
                          <IconButton
                            size="sm"
                            variant="outlined"
                            onClick={() => handleCheckProvider(provider.id)}
                            disabled={isChecking}
                            sx={{ ml: 0.5 }}
                            title="Check provider status"
                          >
                            <ActivityIcon size={16} />
                          </IconButton>
                        </Stack>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Stack
                          direction="row"
                          gap={0.5}
                          justifyContent="flex-end"
                        >
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() => {
                              setProviderId(provider.id);
                              setOpenProviderDetailsModal(true);
                            }}
                            disabled={
                              providersLoading || providers === undefined
                            }
                            sx={{ minWidth: '60px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            color="danger"
                            variant="outlined"
                            onClick={() =>
                              handleDeleteProvider(provider.id, provider.name)
                            }
                            disabled={
                              !iAmOwner ||
                              providersLoading ||
                              providers === undefined
                            }
                            sx={{ minWidth: '60px', fontSize: '0.75rem' }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
          <Button
            startDecorator={<PlusIcon />}
            onClick={() => setOpenProviderDetailsModal(true)}
            variant="soft"
            disabled={!iAmOwner || providersLoading || providers === undefined}
          >
            Add Provider {!iAmOwner ? '(Only owners can add providers)' : ''}
          </Button>
        </Box>
        {iAmOwner && (
          <Box sx={{ mt: 4 }}>
            <Tabs
              aria-label="Team settings tabs"
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
                <Tab>GitHub PAT</Tab>
                <Tab>Team Secrets</Tab>
                <Tab>Quota Settings</Tab>
                <Tab>Organization SSH Key</Tab>
              </TabList>

              {/* GitHub PAT Tab */}
              <TabPanel
                value={0}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <Typography
                  level="title-lg"
                  mb={2}
                  startDecorator={<GithubIcon />}
                >
                  GitHub Integration
                </Typography>
                <Stack spacing={2} maxWidth={500}>
                  <Alert color="neutral" variant="soft">
                    Set a GitHub Personal Access Token (PAT) to enable cloning
                    private repositories in tasks. The PAT is stored securely in
                    your team's workspace and shared across all team members.
                  </Alert>
                  {loadingPAT ? (
                    <CircularProgress size="sm" />
                  ) : (
                    <>
                      {githubPATExists && (
                        <Alert color="success" variant="soft">
                          GitHub PAT is configured. Last 4 characters:{' '}
                          {githubPATMasked}
                        </Alert>
                      )}
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={
                            githubPATExists
                              ? 'Enter new PAT to update'
                              : 'Enter GitHub Personal Access Token'
                          }
                          value={githubPAT}
                          onChange={(e) => setGithubPAT(e.target.value)}
                          disabled={!iAmOwner || savingPAT}
                          sx={{ fontFamily: 'monospace' }}
                        />
                        <Typography level="body-sm" sx={{ mt: 0.5 }}>
                          {iAmOwner
                            ? 'Only team owners can set or update the GitHub PAT.'
                            : 'Only team owners can manage the GitHub PAT.'}
                        </Typography>
                      </FormControl>
                      <Stack direction="row" spacing={2}>
                        <Button
                          variant="solid"
                          onClick={handleSaveGitHubPAT}
                          disabled={!iAmOwner || savingPAT || loadingPAT}
                          loading={savingPAT}
                        >
                          {githubPATExists ? 'Update PAT' : 'Save PAT'}
                        </Button>
                        {githubPATExists && (
                          <Button
                            variant="outlined"
                            color="danger"
                            onClick={async () => {
                              setGithubPAT('');
                              await handleSaveGitHubPAT();
                            }}
                            disabled={!iAmOwner || savingPAT || loadingPAT}
                          >
                            Remove PAT
                          </Button>
                        )}
                      </Stack>
                    </>
                  )}
                </Stack>
              </TabPanel>

              {/* Team Secrets Tab */}
              <TabPanel
                value={1}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <TeamSecretsSection teamId={authContext.team?.id || ''} />
              </TabPanel>

              {/* Quota Settings Tab */}
              <TabPanel
                value={2}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <QuotaSettingsSection teamId={authContext.team?.id || ''} />
              </TabPanel>

              {/* SSH Key Tab */}
              <TabPanel
                value={3}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <SshKeySection teamId={authContext.team?.id || ''} />
              </TabPanel>
            </Tabs>
          </Box>
        )}
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
      <InviteUserModal
        open={openInviteModal}
        onClose={() => setOpenInviteModal(false)}
        teamId={authContext.team?.id || ''}
      />
      <ProviderDetailsModal
        open={openProviderDetailsModal}
        onClose={() => {
          setOpenProviderDetailsModal(false);
          setProviderId('');
          providersMutate();
        }}
        teamId={authContext.team?.id || ''}
        providerId={providerId}
      />
      <Modal
        open={openSetLogoModal}
        onClose={() => {
          setOpenSetLogoModal(false);
          setTeamLogoFile(null);
          setTeamLogoPreview(null);
        }}
      >
        <ModalDialog aria-labelledby="set-logo-title" sx={{ minWidth: 320 }}>
          <ModalClose />
          <Typography id="set-logo-title" level="h4">
            Set Team Logo
          </Typography>

          <Box sx={{ mt: 2 }}>
            <FormControl>
              <FormLabel>Team Logo</FormLabel>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {teamLogoPreview && (
                  <Box
                    component="img"
                    src={teamLogoPreview}
                    alt="Logo preview"
                    sx={{
                      width: 64,
                      height: 64,
                      objectFit: 'contain',
                      borderRadius: 'sm',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  />
                )}
                <Button
                  component="label"
                  variant="outlined"
                  size="sm"
                  disabled={uploadingLogo}
                >
                  {teamLogoPreview ? 'Change Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e: any) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setTeamLogoFile(file);
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setTeamLogoPreview(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </Button>
                {teamLogoPreview && (
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={() => {
                      setTeamLogoFile(null);
                      setTeamLogoPreview(null);
                    }}
                    disabled={uploadingLogo}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            </FormControl>
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
              onClick={() => {
                setOpenSetLogoModal(false);
                setTeamLogoFile(null);
                setTeamLogoPreview(null);
              }}
              disabled={uploadingLogo}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!authContext?.team?.id || !teamLogoFile || !iAmOwner)
                  return;
                setUploadingLogo(true);
                try {
                  const formData = new FormData();
                  formData.append('logo', teamLogoFile);

                  const res = await authContext.fetchWithAuth(
                    `teams/${authContext.team.id}/logo`,
                    {
                      method: 'PUT',
                      body: formData,
                    },
                  );

                  if (res.ok) {
                    // Refresh logo display
                    const logoRes = await authContext.fetchWithAuth(
                      `teams/${authContext.team.id}/logo`,
                      { method: 'GET' },
                    );
                    if (logoRes.ok) {
                      const blob = await logoRes.blob();
                      const url = URL.createObjectURL(blob);
                      setTeamLogo(url);
                      // Update the logo in the teamLogos map for dropdown
                      const teamId = authContext.team?.id;
                      if (teamId) {
                        setTeamLogos((prev) => ({
                          ...prev,
                          [teamId]: url,
                        }));
                      }
                    }
                    setOpenSetLogoModal(false);
                    setTeamLogoFile(null);
                    setTeamLogoPreview(null);
                  }
                } catch (e: any) {
                  console.error('Error uploading logo:', e);
                } finally {
                  setUploadingLogo(false);
                }
              }}
              disabled={uploadingLogo || !teamLogoFile}
            >
              {uploadingLogo ? 'Uploading...' : 'Save'}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
