import {
  Box,
  Button,
  Typography,
  Stack,
  Table,
  Sheet,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Switch,
  Tooltip,
} from '@mui/joy';
import {
  NetworkIcon,
  PlusIcon,
  ServerIcon,
  ActivityIcon,
  StarIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import RenameTeamModal from './RenameTeamModal';
import InviteUserModal from './InviteUserModal';
import AcceptedInvitationsModal from './AcceptedInvitationsModal';
import ProviderDetailsModal from './ProviderDetailsModal';
import ProviderResourceGroupsModal from './ProviderResourceGroupsModal';
import LocalProviderRefreshModal from './LocalProviderRefreshModal';
import QuotaSettingsSection from './QuotaSettingsSection';
import TeamSecretsSection from './TeamSecretsSection';
import SshKeySection from './SshKeySection';
import PermissionsSection from './PermissionsSection';
import MembersSection from './MembersSection';
import InvitationsSection from './InvitationsSection';
import NewTeamModal from './NewTeamModal';
import SetTeamLogoModal from './SetTeamLogoModal';
import TeamHeader from './TeamHeader';
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
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState<boolean>(false);
  const [openNewTeamModal, setOpenNewTeamModal] = useState<boolean>(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [openInviteModal, setOpenInviteModal] = useState<boolean>(false);
  const [openAcceptedInvitationsModal, setOpenAcceptedInvitationsModal] =
    useState<boolean>(false);
  const [showExpiredInvitations, setShowExpiredInvitations] =
    useState<boolean>(false);
  const [openProviderDetailsModal, setOpenProviderDetailsModal] =
    useState<boolean>(false);
  const [providerId, setProviderId] = useState<string>('');
  const [openProviderResourceGroupsModal, setOpenProviderResourceGroupsModal] =
    useState<boolean>(false);
  const [providerForResourceGroups, setProviderForResourceGroups] = useState<
    any | null
  >(null);
  const [checkingProviderId, setCheckingProviderId] = useState<string | null>(
    null,
  );
  const [providerCheckStatus, setProviderCheckStatus] = useState<
    Record<string, boolean | null>
  >({});
  type ProbeStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error';
  const [probeStatusMap, setProbeStatusMap] = useState<
    Record<string, ProbeStatus>
  >({});
  const [probeMessageMap, setProbeMessageMap] = useState<
    Record<string, string>
  >({});
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [openSetLogoModal, setOpenSetLogoModal] = useState<boolean>(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<number>(0);
  const [localSetupModalOpen, setLocalSetupModalOpen] = useState(false);
  const [localSetupProviderName, setLocalSetupProviderName] = useState('');
  const [localSetupStatus, setLocalSetupStatus] = useState<string | null>(null);
  const [localSetupLogTail, setLocalSetupLogTail] = useState<string>('');
  const [localSetupInProgressProviderId, setLocalSetupInProgressProviderId] =
    useState<string | null>(null);
  const probePollTimeoutByProviderRef = useRef<Record<string, number>>({});
  const probePollingActiveByProviderRef = useRef<Record<string, boolean>>({});

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

  // Get compute_provider list (include disabled for admin view)
  const {
    data: providers,
    mutate: providersMutate,
    isLoading: providersLoading,
  } = useAPI('compute_provider', ['listAll']);

  // Simplify errors: show all errors under the "Members" title
  const [roleError, setRoleError] = useState<string | undefined>(undefined);

  const iAmOwner = members?.members?.some((m: any) => {
    return m.user_id === authContext.user?.id && m.role === 'owner';
  });
  const allInvitations = invitations?.invitations ?? [];
  const pendingInvitations = allInvitations.filter(
    (invitation: any) => invitation.status === 'pending',
  );
  const expiredInvitations = allInvitations.filter(
    (invitation: any) => invitation.status === 'expired',
  );
  const acceptedInvitations = allInvitations.filter(
    (invitation: any) => invitation.status === 'accepted',
  );
  const visibleInvitations = showExpiredInvitations
    ? [...pendingInvitations, ...expiredInvitations]
    : pendingInvitations;

  const currentTeam = authContext.team;
  const usernameForPersonal =
    authContext.user?.first_name ||
    authContext.user?.email?.split('@')[0] ||
    '';
  const isPersonalTeam =
    currentTeam && usernameForPersonal
      ? currentTeam.name === `${usernameForPersonal}'s Team`
      : false;

  async function handleLeaveTeam() {
    if (!currentTeam?.id) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      'Are you sure you want to leave this team? You will no longer see this team or its resources.',
    );
    if (!confirmed) return;

    try {
      const res = await authContext.fetchWithAuth(
        `teams/${currentTeam.id}/members/me`,
        {
          method: 'DELETE',
        },
      );

      if (!res.ok) {
        let bodyText: string;
        try {
          const json = await res.json();
          bodyText = json && json.detail ? json.detail : JSON.stringify(json);
        } catch {
          bodyText = await res.text();
        }
        addNotification({
          type: 'danger',
          message: bodyText || 'Failed to leave team',
        });
        return;
      }

      // Refresh team list and switch to another available team, if any.
      await teamsMutate();

      const availableTeams =
        teams?.teams?.filter((t: any) => t.id !== currentTeam.id) ?? [];
      if (availableTeams.length > 0) {
        const nextTeam = availableTeams[0];
        authContext.setTeam({
          id: nextTeam.id,
          name: nextTeam.name,
        });
        addNotification({
          type: 'success',
          message: `You left ${currentTeam.name} and switched to ${nextTeam.name}`,
        });
      } else {
        addNotification({
          type: 'success',
          message: `You left ${currentTeam.name}`,
        });
      }
    } catch (e: any) {
      addNotification({
        type: 'danger',
        message: e?.message ?? 'Failed to leave team',
      });
    }
  }

  async function handleDeleteTeam() {
    if (!currentTeam?.id || !iAmOwner) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      'Are you sure you want to delete this team for all members? All members will lose access to this team and its resources. This action cannot be undone.',
    );
    if (!confirmed) return;

    try {
      const res = await authContext.fetchWithAuth(`teams/${currentTeam.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        let bodyText: string;
        try {
          const json = await res.json();
          bodyText = json && json.detail ? json.detail : JSON.stringify(json);
        } catch {
          bodyText = await res.text();
        }
        addNotification({
          type: 'danger',
          message: bodyText || 'Failed to delete team',
        });
        return;
      }

      // Refresh team list and switch to another available team, if any.
      await teamsMutate();

      const availableTeams =
        teams?.teams?.filter((t: any) => t.id !== currentTeam.id) ?? [];
      if (availableTeams.length > 0) {
        const nextTeam = availableTeams[0];
        authContext.setTeam({
          id: nextTeam.id,
          name: nextTeam.name,
        });
        addNotification({
          type: 'success',
          message: `Deleted ${currentTeam.name}. Switched to ${nextTeam.name}.`,
        });
      } else {
        addNotification({
          type: 'success',
          message: `Deleted ${currentTeam.name}.`,
        });
      }
    } catch (e: any) {
      addNotification({
        type: 'danger',
        message: e?.message ?? 'Failed to delete team',
      });
    }
  }

  // Re-fetch providers whenever the selected team changes
  useEffect(() => {
    providersMutate();
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

  // Clear all role errors or add an error text
  function handleSetRoleError(message?: string) {
    if (!message) {
      setRoleError(undefined);
    } else {
      setRoleError(message);
    }
  }

  async function handleNewTeam(name: string, logoFile: File | null) {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      if (logoFile) {
        formData.append('logo', logoFile);
      }

      const res = await authContext.fetchWithAuth('teams', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let detail = 'Failed to create team. Please try again.';
        try {
          const errBody = await res.json();
          if (errBody?.detail) {
            detail = errBody.detail;
          }
        } catch {
          // Response body was not JSON; fall back to the default message.
        }
        throw new Error(detail);
      }

      const data = await res.json();
      teamsMutate();

      if (logoFile && data.id) {
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
      // Re-throw so NewTeamModal can surface the error to the user instead of
      // silently closing as if the team was created.
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadTeamLogo(file: File) {
    const teamId = authContext?.team?.id;
    if (!teamId || !iAmOwner) return;
    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await authContext.fetchWithAuth(`teams/${teamId}/logo`, {
        method: 'PUT',
        body: formData,
      });

      if (!res.ok) return;

      const logoRes = await authContext.fetchWithAuth(`teams/${teamId}/logo`, {
        method: 'GET',
      });
      if (logoRes.ok) {
        const blob = await logoRes.blob();
        const url = URL.createObjectURL(blob);
        setTeamLogo(url);
        setTeamLogos((prev) => ({
          ...prev,
          [teamId]: url,
        }));
      }
    } catch (e: any) {
      console.error('Error uploading logo:', e);
    }
  }

  async function handleRemoveTeamLogo() {
    const teamId = authContext?.team?.id;
    if (!teamId || !iAmOwner) return;
    try {
      const res = await authContext.fetchWithAuth(`teams/${teamId}/logo`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTeamLogo(null);
        setTeamLogos((prev) => {
          const updated = { ...prev };
          delete updated[teamId];
          return updated;
        });
      }
    } catch (e: any) {
      console.error('Error deleting logo:', e);
    }
  }

  async function handleUpdateRole(userId: string, currentRole: string) {
    // No team selected / invalid input
    const teamId = authContext?.team?.id;
    if (!teamId || !userId) return;

    const newRole = currentRole === 'owner' ? 'member' : 'owner';

    // Warn when demoting yourself — you can't undo this without another owner.
    if (userId === authContext.user?.id && newRole === 'member') {
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        'Are you sure you want to change your own role from owner to member? You will lose the ability to manage this team and you will not be able to undo this change yourself.',
      );
      if (!confirmed) return;
    }

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

  async function handleCancelInvitation(invitationId: string) {
    if (!authContext?.team?.id) return;
    try {
      const res = await authContext.fetchWithAuth(
        `teams/${authContext.team.id}/invitations/${invitationId}`,
        { method: 'DELETE' },
      );
      if (res.ok && invitationsMutate) {
        invitationsMutate();
      }
    } catch (e: any) {
      console.error('Error cancelling invitation:', e);
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

  async function handleSetDefaultProvider(id: string, isDefault: boolean) {
    try {
      const res = await authContext.fetchWithAuth(
        chatAPI.getAPIFullPath('compute_provider', ['update'], {
          providerId: id,
        }),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_default: isDefault }),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          detail: 'Failed to set default provider',
        }));
        // eslint-disable-next-line no-alert
        alert(
          `Failed to set default provider: ${errorData.detail || 'Unknown error'}`,
        );
        return;
      }
      if (providersMutate) providersMutate();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(`Error updating default provider: ${e?.message ?? String(e)}`);
    }
  }

  async function handleToggleProviderDisabled(
    id: string,
    currentlyDisabled: boolean,
  ) {
    try {
      const res = await authContext.fetchWithAuth(
        chatAPI.getAPIFullPath('compute_provider', ['update'], {
          providerId: id,
        }),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled: !currentlyDisabled }),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          detail: 'Failed to update provider',
        }));
        alert(
          `Failed to toggle provider: ${errorData.detail || 'Unknown error'}`,
        );
        return;
      }
      if (providersMutate) providersMutate();
    } catch (e: any) {
      alert(`Error toggling provider: ${e?.message ?? String(e)}`);
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

  async function handleStorageProbe(id: string) {
    probePollingActiveByProviderRef.current[id] = false;
    const previousTimeout = probePollTimeoutByProviderRef.current[id];
    if (previousTimeout !== undefined) {
      window.clearTimeout(previousTimeout);
      delete probePollTimeoutByProviderRef.current[id];
    }
    probePollingActiveByProviderRef.current[id] = true;

    setProbeStatusMap((prev) => ({ ...prev, [id]: 'running' }));
    setProbeMessageMap((prev) => ({ ...prev, [id]: 'Launching probe job…' }));

    try {
      const launchRes = await authContext.fetchWithAuth(
        chatAPI.Endpoints.ComputeProvider.LaunchStorageProbe(id),
        { method: 'POST' },
      );
      if (!launchRes.ok) {
        setProbeStatusMap((prev) => ({ ...prev, [id]: 'error' }));
        setProbeMessageMap((prev) => ({
          ...prev,
          [id]: 'Failed to launch probe job.',
        }));
        return;
      }
      const { job_id: jobId } = await launchRes.json();

      const MAX_POLLS = 10;
      let polls = 0;
      const pollStatus = async (): Promise<void> => {
        if (!probePollingActiveByProviderRef.current[id]) {
          return;
        }

        polls += 1;
        const checkRes = await authContext.fetchWithAuth(
          chatAPI.Endpoints.ComputeProvider.CheckStorageProbe(
            id,
            String(jobId),
          ),
          { method: 'GET' },
        );
        if (!probePollingActiveByProviderRef.current[id]) {
          return;
        }

        if (!checkRes.ok) {
          probePollingActiveByProviderRef.current[id] = false;
          setProbeStatusMap((prev) => ({ ...prev, [id]: 'error' }));
          setProbeMessageMap((prev) => ({
            ...prev,
            [id]: 'Could not reach check endpoint.',
          }));
          return;
        }
        const checkData = await checkRes.json();
        if (checkData.found) {
          probePollingActiveByProviderRef.current[id] = false;
          setProbeStatusMap((prev) => ({ ...prev, [id]: 'passed' }));
          setProbeMessageMap((prev) => ({
            ...prev,
            [id]: `Sentinel found in shared storage`,
          }));
        } else if (polls >= MAX_POLLS) {
          probePollingActiveByProviderRef.current[id] = false;
          setProbeStatusMap((prev) => ({ ...prev, [id]: 'failed' }));
          setProbeMessageMap((prev) => ({
            ...prev,
            [id]: `Timed out — file not found in shared storage`,
          }));
        } else {
          setProbeMessageMap((prev) => ({
            ...prev,
            [id]: 'Waiting for sentinel file…',
          }));
          probePollTimeoutByProviderRef.current[id] = window.setTimeout(
            pollStatus,
            20000,
          );
        }
      };

      await pollStatus();
    } catch {
      probePollingActiveByProviderRef.current[id] = false;
      setProbeStatusMap((prev) => ({ ...prev, [id]: 'error' }));
      setProbeMessageMap((prev) => ({
        ...prev,
        [id]: 'Unexpected error running storage probe.',
      }));
    }
  }

  function startLocalSetupStatusPolling(targetProviderId: string) {
    const poll = async () => {
      try {
        const response = await authContext.fetchWithAuth(
          chatAPI.Endpoints.ComputeProvider.SetupStatus(targetProviderId),
          { method: 'GET' },
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const detail =
            (error &&
              (error.detail?.message || error.detail || error.message)) ||
            'Failed to read setup status';
          setLocalSetupStatus(detail);
          setLocalSetupInProgressProviderId(null);
          addNotification({
            type: 'danger',
            message: detail,
          });
          return;
        }

        const data = await response.json().catch(() => ({}));

        // Match ProviderDetailsModal behavior: treat only idle+done as finished.
        if (data.status === 'idle' && data.done) {
          setLocalSetupStatus('Local provider refresh finished.');
          setLocalSetupInProgressProviderId(null);
          providersMutate();
          setLocalSetupModalOpen(false);
          return;
        }

        const message: string =
          data.message ||
          data.error ||
          (data.done
            ? 'Local provider refresh finished.'
            : 'Refreshing local provider setup...');
        setLocalSetupStatus(message);
        setLocalSetupLogTail(
          typeof data.log_tail === 'string' ? data.log_tail : '',
        );

        if (!data.done) {
          window.setTimeout(poll, 2000);
        } else {
          setLocalSetupInProgressProviderId(null);
          addNotification({
            type: data.error ? 'danger' : 'success',
            message,
          });
          providersMutate();
          if (!data.error) {
            setLocalSetupModalOpen(false);
          }
        }
      } catch {
        setLocalSetupStatus('Failed to read setup status. Please try again.');
        setLocalSetupInProgressProviderId(null);
        addNotification({
          type: 'danger',
          message: 'Local provider refresh failed to report status.',
        });
      }
    };

    setLocalSetupInProgressProviderId(targetProviderId);
    setLocalSetupStatus('Refreshing local provider setup...');
    setLocalSetupLogTail('');
    poll();
  }

  async function handleRefreshLocalProvider(
    targetProviderId: string,
    providerName: string,
  ) {
    if (localSetupInProgressProviderId) {
      addNotification({
        type: 'warning',
        message:
          'A local provider refresh is already in progress. Please wait for it to finish.',
      });
      return;
    }

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Are you sure you want to refresh "${providerName || 'Local Provider'}"? This will reinstall the base environment.`,
    );
    if (!confirmed) {
      return;
    }

    setLocalSetupProviderName(providerName);
    setLocalSetupModalOpen(true);
    setLocalSetupStatus('Starting local provider refresh...');
    setLocalSetupLogTail('');
    try {
      const response = await authContext.fetchWithAuth(
        `${chatAPI.Endpoints.ComputeProvider.Setup(targetProviderId)}?refresh=true`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail =
          (error && (error.detail?.message || error.detail || error.message)) ||
          'Failed to start local provider refresh';
        setLocalSetupStatus(detail);
        addNotification({
          type: 'danger',
          message: detail,
        });
        setLocalSetupInProgressProviderId(null);
        return;
      }
      startLocalSetupStatusPolling(targetProviderId);
    } catch {
      setLocalSetupStatus('Failed to start local provider refresh');
      addNotification({
        type: 'danger',
        message: 'Failed to start local provider refresh',
      });
      setLocalSetupInProgressProviderId(null);
    }
  }

  useEffect(() => {
    return () => {
      const timeoutEntries = Object.entries(
        probePollTimeoutByProviderRef.current,
      );
      timeoutEntries.forEach(([, timeoutId]) => {
        window.clearTimeout(timeoutId);
      });
      probePollTimeoutByProviderRef.current = {};
      probePollingActiveByProviderRef.current = {};
    };
  }, []);

  useEffect(() => {
    const timeoutEntries = Object.entries(
      probePollTimeoutByProviderRef.current,
    );
    timeoutEntries.forEach(([, timeoutId]) => {
      window.clearTimeout(timeoutId);
    });
    probePollTimeoutByProviderRef.current = {};
    probePollingActiveByProviderRef.current = {};
  }, [authContext?.team?.id]);

  return (
    <Sheet sx={{ overflowY: 'auto', p: 2 }}>
      <Typography level="h2" mb={2}>
        Team Settings
      </Typography>
      <Box>
        <TeamHeader
          teams={teams?.teams}
          teamLogos={teamLogos}
          currentTeamId={authContext.team?.id}
          onSelectTeam={(selectedId) => {
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
          loading={loading}
          teamLogo={teamLogo}
          iAmOwner={Boolean(iAmOwner)}
          isPersonalTeam={isPersonalTeam}
          hasCurrentTeam={Boolean(currentTeam?.id)}
          onNewTeam={() => setOpenNewTeamModal(true)}
          onRename={() => setRenameModalOpen(true)}
          onDelete={handleDeleteTeam}
          onLeave={handleLeaveTeam}
          onViewUsageReport={() => navigate('/team/usage-report')}
          onSetLogo={() => setOpenSetLogoModal(true)}
          onRemoveLogo={handleRemoveTeamLogo}
        />
        <NewTeamModal
          open={openNewTeamModal}
          onClose={() => setOpenNewTeamModal(false)}
          onCreate={handleNewTeam}
        />

        <MembersSection
          members={members?.members}
          roleError={roleError}
          iAmOwner={iAmOwner}
          currentUserId={authContext.user?.id}
          onUpdateRole={handleUpdateRole}
          onInvite={() => setOpenInviteModal(true)}
        />
        <InvitationsSection
          iAmOwner={iAmOwner}
          allInvitations={allInvitations}
          visibleInvitations={visibleInvitations}
          acceptedInvitations={acceptedInvitations}
          showExpiredInvitations={showExpiredInvitations}
          onToggleShowExpired={setShowExpiredInvitations}
          onViewAccepted={() => setOpenAcceptedInvitationsModal(true)}
          onCancelInvitation={handleCancelInvitation}
        />
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
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>Enabled</th>
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>Default</th>
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  Lifecycle
                </th>
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
                    <tr
                      key={provider.id}
                      style={{
                        opacity: provider.disabled ? 0.5 : 1,
                      }}
                    >
                      <td>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <NetworkIcon size={16} />
                          <Typography fontWeight="md" level="body-sm">
                            {provider?.name ?? '—'}
                          </Typography>
                          {provider?.is_default && (
                            <Chip
                              variant="soft"
                              color="primary"
                              size="sm"
                              startDecorator={<StarIcon size={12} />}
                              sx={{ fontSize: '0.7rem', px: 0.5 }}
                            >
                              Default
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {provider?.type}
                        </Typography>
                      </td>
                      <td>
                        <Tooltip
                          title={
                            !iAmOwner
                              ? 'Only owners can toggle providers'
                              : provider.disabled
                                ? 'Enable this provider'
                                : 'Disable this provider'
                          }
                        >
                          <span>
                            <Switch
                              size="sm"
                              checked={!provider.disabled}
                              disabled={!iAmOwner}
                              onChange={() =>
                                handleToggleProviderDisabled(
                                  provider.id,
                                  provider.disabled,
                                )
                              }
                            />
                          </span>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip
                          title={
                            !iAmOwner
                              ? 'Only owners can change the default provider'
                              : provider.is_default
                                ? 'This provider is used when a task does not specify one. Click to clear default.'
                                : 'Use this provider by default when a task does not specify one'
                          }
                        >
                          <span>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color={
                                provider.is_default ? 'primary' : 'neutral'
                              }
                              disabled={!iAmOwner || provider.disabled}
                              onClick={() =>
                                handleSetDefaultProvider(
                                  provider.id,
                                  !provider.is_default,
                                )
                              }
                              aria-label={
                                provider.is_default
                                  ? 'Unset default provider'
                                  : 'Set as default provider'
                              }
                            >
                              <StarIcon
                                size={16}
                                fill={
                                  provider.is_default ? 'currentColor' : 'none'
                                }
                              />
                            </IconButton>
                          </span>
                        </Tooltip>
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
                      <td>
                        <Stack
                          direction="column"
                          gap={0.5}
                          alignItems="flex-start"
                        >
                          <Tooltip
                            title={
                              iAmOwner
                                ? 'Verify provider lifecycle'
                                : 'Only admins can verify provider lifecycle'
                            }
                          >
                            <span>
                              <IconButton
                                size="sm"
                                variant="outlined"
                                disabled={
                                  !iAmOwner ||
                                  probeStatusMap[provider.id] === 'running'
                                }
                                onClick={() => {
                                  if (
                                    probeStatusMap[provider.id] !== 'running'
                                  ) {
                                    handleStorageProbe(provider.id);
                                  }
                                }}
                                aria-label="Verify provider lifecycle"
                              >
                                {probeStatusMap[provider.id] === 'running' ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <ServerIcon size={16} />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          {probeStatusMap[provider.id] === 'passed' && (
                            <Chip color="success" size="sm" variant="soft">
                              Storage OK
                            </Chip>
                          )}
                          {(probeStatusMap[provider.id] === 'failed' ||
                            probeStatusMap[provider.id] === 'error') && (
                            <Chip color="danger" size="sm" variant="soft">
                              {probeStatusMap[provider.id] === 'failed'
                                ? 'File not found'
                                : 'Error'}
                            </Chip>
                          )}
                          {probeMessageMap[provider.id] && (
                            <Typography
                              level="body-xs"
                              sx={{
                                color:
                                  probeStatusMap[provider.id] === 'passed'
                                    ? 'success.600'
                                    : probeStatusMap[provider.id] === 'running'
                                      ? 'text.secondary'
                                      : 'danger.600',
                                fontFamily: 'monospace',
                                maxWidth: '240px',
                                wordBreak: 'break-all',
                              }}
                            >
                              {probeMessageMap[provider.id]}
                            </Typography>
                          )}
                        </Stack>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Stack
                          direction="column"
                          gap={0.5}
                          alignItems="flex-end"
                        >
                          <Stack direction="row" gap={0.5}>
                            {provider.type === 'local' && (
                              <Button
                                size="sm"
                                variant="outlined"
                                onClick={() =>
                                  handleRefreshLocalProvider(
                                    provider.id,
                                    provider.name || 'Local Provider',
                                  )
                                }
                                loading={
                                  localSetupInProgressProviderId === provider.id
                                }
                                disabled={
                                  !iAmOwner ||
                                  providersLoading ||
                                  providers === undefined ||
                                  Boolean(localSetupInProgressProviderId)
                                }
                                sx={{ minWidth: '70px', fontSize: '0.75rem' }}
                              >
                                Refresh
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outlined"
                              onClick={() => {
                                setProviderId(provider.id);
                                setOpenProviderDetailsModal(true);
                              }}
                              disabled={
                                provider.type === 'local' ||
                                providersLoading ||
                                providers === undefined
                              }
                              sx={{ minWidth: '60px', fontSize: '0.75rem' }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outlined"
                              onClick={() => {
                                setProviderForResourceGroups(provider);
                                setOpenProviderResourceGroupsModal(true);
                              }}
                              disabled={
                                !iAmOwner ||
                                providersLoading ||
                                providers === undefined
                              }
                              sx={{ minWidth: '70px', fontSize: '0.75rem' }}
                            >
                              Groups
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
                <Tab>Team Secrets</Tab>
                <Tab>Quota Settings</Tab>
                <Tab>Organization SSH Key</Tab>
                <Tab>Permissions</Tab>
              </TabList>

              {/* Team Secrets Tab */}
              <TabPanel
                value={0}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <TeamSecretsSection teamId={authContext.team?.id || ''} />
              </TabPanel>

              {/* Quota Settings Tab */}
              <TabPanel
                value={1}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <QuotaSettingsSection teamId={authContext.team?.id || ''} />
              </TabPanel>

              {/* SSH Key Tab */}
              <TabPanel
                value={2}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <SshKeySection teamId={authContext.team?.id || ''} />
              </TabPanel>

              {/* Permissions Tab */}
              <TabPanel
                value={3}
                sx={{
                  p: 2,
                  overflowY: 'auto',
                }}
              >
                <PermissionsSection
                  teamId={authContext.team?.id || ''}
                  members={members?.members || []}
                />
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
        hasLocalProvider={
          Array.isArray(providers) &&
          providers.some((provider: any) => provider?.type === 'local')
        }
      />
      {providerForResourceGroups && (
        <ProviderResourceGroupsModal
          open={openProviderResourceGroupsModal}
          onClose={() => {
            setOpenProviderResourceGroupsModal(false);
            setProviderForResourceGroups(null);
          }}
          provider={providerForResourceGroups}
          onSaved={() => {
            providersMutate();
          }}
        />
      )}
      <LocalProviderRefreshModal
        open={localSetupModalOpen}
        onClose={() => setLocalSetupModalOpen(false)}
        providerName={localSetupProviderName}
        setupStatus={localSetupStatus}
        setupLogTail={localSetupLogTail}
        isInProgress={Boolean(localSetupInProgressProviderId)}
        titlePrefix="Refreshing"
        description="This runs a force refresh of the local provider environment"
      />
      <AcceptedInvitationsModal
        open={openAcceptedInvitationsModal}
        onClose={() => setOpenAcceptedInvitationsModal(false)}
        invitations={acceptedInvitations}
      />
      <SetTeamLogoModal
        open={openSetLogoModal}
        onClose={() => setOpenSetLogoModal(false)}
        onSave={handleUploadTeamLogo}
      />
    </Sheet>
  );
}
