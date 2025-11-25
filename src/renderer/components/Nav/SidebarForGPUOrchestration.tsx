import { useState, useEffect, FormEvent } from 'react';

import {
  CodeIcon,
  BoxesIcon,
  FileTextIcon,
  FlaskConicalIcon,
  SettingsIcon,
  GithubIcon,
  FileIcon,
  UserIcon,
  LogOutIcon,
  StretchHorizontalIcon,
  LibraryBigIcon,
  ComputerIcon,
  GraduationCapIcon,
  SquareStackIcon,
  ChartColumnIncreasingIcon,
  LayersIcon,
} from 'lucide-react';

import {
  Alert,
  Box,
  ButtonGroup,
  Button,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Sheet,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';

import {
  useModelStatus,
  usePluginStatus,
  useAPI,
  API_URL,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';
import { DEFAULT_API_FALLBACK } from '../User/authCallbackUtils';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';

function ExperimentMenuItems({ DEV_MODE, experimentInfo, models }) {
  const [pipelineTag, setPipelineTag] = useState<string | null>(null);

  return (
    <List
      sx={{
        '--ListItem-radius': '6px',
        '--ListItem-minHeight': '32px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <SubNavItem
        title="Inference"
        path="/experiment/model"
        icon={<LayersIcon strokeWidth={1} />}
        disabled
      />
      <SubNavItem
        title="Tasks"
        path="/experiment/tasks"
        icon={<StretchHorizontalIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Train"
        path="/experiment/training"
        icon={<GraduationCapIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Generate"
        path="/experiment/generate"
        icon={<SquareStackIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Evaluate"
        path="/experiment/eval"
        icon={<ChartColumnIncreasingIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Documents"
        path="/experiment/documents"
        icon={<FileIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Notes"
        path="/experiment/notes"
        icon={<FlaskConicalIcon />}
        disabled={!experimentInfo?.name}
      />
    </List>
  );
}

function GlobalMenuItems({ DEV_MODE, experimentInfo, outdatedPluginsCount }) {
  // Get GPU orchestration server URL from healthz endpoint
  const [healthzData, setHealthzData] = useState<any>(null);

  useEffect(() => {
    const fetchHealthz = async () => {
      try {
        const data = await apiHealthz();
        setHealthzData(data);
      } catch (error) {
        console.error('Failed to fetch healthz data:', error);
      }
    };

    fetchHealthz();
  }, []);

  const handleGPUOrchestraionClick = () => {
    if (healthzData?.gpu_orchestration_server) {
      const gpuServerUrl = healthzData.gpu_orchestration_server;
      const port = healthzData.gpu_orchestration_server_port || '8000';

      // Construct the full URL
      let fullUrl = gpuServerUrl;
      if (!fullUrl.includes('://')) {
        fullUrl = `http://${fullUrl}`;
      }

      // Check if port is already included in the URL
      const urlObj = new URL(fullUrl);
      if (!urlObj.port && port && port !== '80' && port !== '443') {
        fullUrl = `${urlObj.protocol}//${urlObj.hostname}:${port}`;
      }

      // Ensure trailing slash
      if (!fullUrl.endsWith('/')) {
        fullUrl = `${fullUrl}/`;
      }

      // Open in new tab
      window.open(fullUrl, '_blank');
    }
  };

  return (
    <List
      sx={{
        '--ListItem-radius': '6px',
        '--ListItem-minHeight': '32px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <Divider sx={{ marginBottom: 1 }} />

      <SubNavItem title="Model Registry" path="/zoo" icon={<BoxesIcon />} />
      <SubNavItem title="Datasets" path="/data" icon={<FileTextIcon />} />
      <SubNavItem
        title="Task Library"
        path="/task_library"
        icon={<LibraryBigIcon />}
      />
      <SubNavItem
        title="API"
        path="/api"
        icon={<CodeIcon />}
        disabled={!experimentInfo?.name}
      />

      {/* Computer icon for GPU Orchestration */}
      {healthzData?.gpu_orchestration_server && (
        <ListItem className="FirstSidebar_Content">
          <ListItemButton
            variant="plain"
            onClick={handleGPUOrchestraionClick}
            sx={{
              '&:hover': {
                backgroundColor: 'var(--joy-palette-primary-100)',
              },
            }}
          >
            <ListItemDecorator sx={{ minInlineSize: '30px' }}>
              <ComputerIcon strokeWidth={1} />
            </ListItemDecorator>
            <ListItemContent>
              <Typography level="body-sm">GPU Orchestration</Typography>
            </ListItemContent>
          </ListItemButton>
        </ListItem>
      )}
    </List>
  );
}

function extractWorkOSDetails(userDetails: any) {
  const accounts = Array.isArray(userDetails?.oauth_accounts)
    ? userDetails.oauth_accounts
    : [];
  const workosAccount = accounts.find(
    (account: any) =>
      account?.oauth_name === 'workos' || account?.oauth_name === 'openid',
  );

  if (!workosAccount) {
    return {
      account: null,
      organizationId: null,
      organizationSlug: null,
      organizations: [],
    };
  }

  const accountData = (workosAccount?.account_data || {}) as any;
  const workosMeta = (accountData?.workos || {}) as any;
  const userinfo = (accountData?.userinfo || {}) as any;

  const organizationId =
    workosMeta?.organization_id ||
    userinfo?.organization_id ||
    userinfo?.org_id ||
    null;

  const organizationSlug =
    workosMeta?.organization_slug ||
    userinfo?.organization_slug ||
    (typeof userinfo?.organization === 'object'
      ? userinfo.organization?.slug || userinfo.organization?.name
      : null) ||
    null;

  const organizationName =
    workosMeta?.organization_name ||
    (typeof userinfo?.organization === 'object'
      ? userinfo.organization?.name || userinfo.organization?.slug
      : null) ||
    (typeof userinfo?.organization === 'string'
      ? userinfo.organization
      : null) ||
    userinfo?.organization_name ||
    null;

  const rawOrganizations = [
    ...(Array.isArray(userinfo?.organizations) ? userinfo.organizations : []),
    ...(userinfo?.organization ? [userinfo.organization] : []),
  ];

  const organizations = rawOrganizations
    .map((raw: any) => {
      if (!raw || typeof raw !== 'object') {
        if (typeof raw === 'string') {
          return { id: raw, slug: null, name: null };
        }
        return null;
      }
      const id =
        raw.id || raw.organization_id || raw.org_id || raw.profile_id || null;
      const slug = raw.slug || raw.organization_slug || null;
      const name = raw.name || raw.organization_name || raw.profile || null;
      if (!id && !slug && !name) {
        return null;
      }
      return { id, slug, name };
    })
    .filter((item: any) => item);

  const deduped = organizations.reduce((acc: any[], org: any) => {
    const key = org?.id || org?.slug || org?.name;
    if (!key) {
      return acc;
    }
    if (
      !acc.some(
        (existing) =>
          (org?.id && existing?.id === org?.id) ||
          (org?.slug && existing?.slug === org?.slug) ||
          (org?.name && existing?.name === org?.name),
      )
    ) {
      acc.push(org);
    }
    return acc;
  }, [] as any[]);

  const fallbackOrg =
    organizationId || organizationSlug || organizationName
      ? {
          id: organizationId,
          slug: organizationSlug,
          name: organizationName || organizationSlug || organizationId || null,
        }
      : null;

  if (
    fallbackOrg &&
    !deduped.some(
      (existing) =>
        (fallbackOrg.id && existing?.id === fallbackOrg.id) ||
        (fallbackOrg.slug && existing?.slug === fallbackOrg.slug) ||
        (fallbackOrg.name && existing?.name === fallbackOrg.name),
    )
  ) {
    deduped.push(fallbackOrg);
  }

  return {
    account: workosAccount,
    organizationId,
    organizationSlug,
    organizationName,
    organizations: deduped,
  };
}

function UserDetailsPanel({ userDetails, mutate, onManageWorkOS }) {
  const workosDetails = extractWorkOSDetails(userDetails);
  const organizationDisplayParts: string[] = [];
  if (workosDetails?.organizationName) {
    organizationDisplayParts.push(workosDetails.organizationName);
  }
  const organizationIdentifier =
    workosDetails?.organizationSlug || workosDetails?.organizationId;
  if (
    organizationIdentifier &&
    (!workosDetails?.organizationName ||
      workosDetails.organizationName !== organizationIdentifier)
  ) {
    organizationDisplayParts.push(organizationIdentifier);
  }
  const organizationDisplay =
    organizationDisplayParts.length > 0
      ? organizationDisplayParts.join(' / ')
      : null;

  // Extract user display information
  const firstName = userDetails?.first_name || '';
  const lastName = userDetails?.last_name || '';
  const profilePictureUrl = userDetails?.profile_picture_url;

  // Create display name - prefer first/last name, fallback to full name, then email
  const displayName =
    firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : userDetails?.name || userDetails?.email || 'User';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      }}
    >
      <Tooltip
        title={
          <Stack spacing={1} sx={{ p: 1 }}>
            {profilePictureUrl && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <img
                  src={profilePictureUrl}
                  alt="Profile"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              </Box>
            )}
            <Typography level="title-sm" sx={{ textAlign: 'center' }}>
              {displayName}
            </Typography>
            {userDetails?.email && (
              <Typography level="body-xs" sx={{ textAlign: 'center' }}>
                {userDetails.email}
              </Typography>
            )}
            {userDetails?.organization_id && (
              <Typography level="body-xs" sx={{ textAlign: 'center' }}>
                Org ID: {userDetails.organization_id}
              </Typography>
            )}
            {organizationDisplay && (
              <Typography level="body-xs" sx={{ textAlign: 'center' }}>
                WorkOS: {organizationDisplay}
              </Typography>
            )}
          </Stack>
        }
        placement="top"
        variant="outlined"
        sx={{ maxWidth: 300 }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            flex: 1,
            minWidth: 0,
          }}
        >
          {profilePictureUrl ? (
            <img
              src={profilePictureUrl}
              alt="Profile"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <UserIcon size="32px" />
          )}
          <Typography
            level="title-sm"
            sx={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '120px',
            }}
          >
            {firstName || userDetails?.name || 'User'}
          </Typography>
        </Box>
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {workosDetails?.account ? (
          <Tooltip title="Manage WorkOS organization scope">
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={onManageWorkOS}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'var(--joy-palette-neutral-100)',
                  borderRadius: 'sm',
                },
              }}
            >
              <SettingsIcon size="18px" />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={async () => {
            await logout();
            await Promise.all([
              window.storage.delete('accessToken'),
              window.storage.delete('userName'),
              window.storage.delete('userEmail'),
            ]);
            mutate();
            alert('User logged out.');
          }}
          sx={{
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'var(--joy-palette-neutral-100)',
              borderRadius: 'sm',
            },
          }}
        >
          <LogOutIcon size="18px" />
        </IconButton>
      </Box>
    </Box>
  );
}

function BottomMenuItems({ themeSetter }) {
  const [workosScopeModalOpen, setWorkosScopeModalOpen] = useState(false);
  const [selectedOrgOption, setSelectedOrgOption] = useState<string | null>(
    null,
  );
  const [organizationInput, setOrganizationInput] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeSuccess, setScopeSuccess] = useState<string | null>(null);
  const [isScoping, setIsScoping] = useState(false);
  const { data: userInfo, mutate: userMutate } = useAPI('users', ['me'], {});

  const workosDetails = userInfo ? extractWorkOSDetails(userInfo) : null;
  const availableOrganizations = workosDetails?.organizations || [];
  const currentOrgLabel =
    workosDetails?.organizationName ||
    workosDetails?.organizationSlug ||
    workosDetails?.organizationId ||
    'Not scoped';
  const hasWorkOSAccount = Boolean(workosDetails?.account);

  useEffect(() => {
    if (workosScopeModalOpen) {
      const defaultOrg = workosDetails?.organizationId || '';
      setSelectedOrgOption(defaultOrg || null);
      setOrganizationInput(defaultOrg || '');
      setScopeError(null);
      setScopeSuccess(null);
    }
  }, [workosScopeModalOpen, workosDetails?.organizationId]);

  useEffect(() => {
    if (!workosDetails?.account && workosScopeModalOpen) {
      setWorkosScopeModalOpen(false);
    }
  }, [workosDetails?.account, workosScopeModalOpen]);

  const handleScopeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = organizationInput.trim();
    if (!trimmed) {
      setScopeError('Organization ID is required.');
      setScopeSuccess(null);
      return;
    }

    const apiBase = API_URL();
    if (!apiBase) {
      setScopeError('API URL is not configured. Set API URL before scoping.');
      setScopeSuccess(null);
      return;
    }

    setIsScoping(true);
    setScopeError(null);
    setScopeSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setScopeError('You must be logged in to scope your WorkOS session.');
        setIsScoping(false);
        return;
      }

      const response = await fetchWithAuth(`${apiBase}auth/workos/scope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organization_id: trimmed }),
      });

      const rawText = await response.text();
      let payload: any = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch (err) {
          payload = null;
        }
      }

      if (!response.ok) {
        const detail =
          (payload && (payload.detail || payload.message)) ||
          rawText ||
          `Failed with status ${response.status}`;
        setScopeError(
          typeof detail === 'string'
            ? detail
            : 'Failed to scope WorkOS session.',
        );
        setIsScoping(false);
        return;
      }

      setScopeSuccess(
        payload?.organization_slug
          ? `Session scoped to ${payload.organization_slug}.`
          : `Session scoped to ${payload?.organization_id || trimmed}.`,
      );
      setSelectedOrgOption(trimmed);
      setOrganizationInput(trimmed);
      if (payload?.access_token) {
        await setAccessToken(payload.access_token);
      }
      if (payload?.refresh_token !== undefined) {
        await setRefreshToken(payload.refresh_token);
      }
      await userMutate();
    } catch (error: any) {
      setScopeError(error?.message || 'Failed to scope WorkOS session.');
    } finally {
      setIsScoping(false);
    }
  };

  return (
    <>
      <Divider sx={{ my: 1 }} />
      <Box
        sx={{
          display: window.platform?.appmode === 'cloud' ? 'flex' : 'none',
          gap: 1,
          alignItems: 'center',
          mb: 1,
          maxWidth: '180px',
        }}
      >
        {userInfo && userInfo.id ? (
          <UserDetailsPanel
            userDetails={userInfo}
            mutate={userMutate}
            onManageWorkOS={() => setWorkosScopeModalOpen(true)}
          />
        ) : null}
      </Box>
      <ButtonGroup
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <ColorSchemeToggle themeSetter={themeSetter} />
        <a
          href="https://github.com/transformerlab/transformerlab-app/"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit Transformer Lab on Github"
        >
          <Tooltip
            title={
              <>
                Visit Transformer Lab on Github
                <br />
                to contribute to the project or
                <br />
                send a bug report.
              </>
            }
          >
            <IconButton variant="plain">
              <GithubIcon strokeWidth={1} />
            </IconButton>
          </Tooltip>
        </a>
      </ButtonGroup>
      <Modal
        open={workosScopeModalOpen && hasWorkOSAccount}
        onClose={() => setWorkosScopeModalOpen(false)}
      >
        <ModalDialog
          aria-labelledby="workos-scope-title"
          sx={{ maxWidth: 420 }}
        >
          <ModalClose />
          <Typography id="workos-scope-title" level="title-lg">
            WorkOS Organization Scope
          </Typography>
          <Typography level="body-sm" sx={{ mt: 1 }}>
            Current organization:{' '}
            <Typography component="span" level="body-sm" fontWeight="lg">
              {currentOrgLabel}
            </Typography>
          </Typography>
          {availableOrganizations.length > 0 ? (
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Choose an organization</FormLabel>
              <Select
                placeholder="Select organization"
                value={selectedOrgOption || null}
                onChange={(_event, value) => {
                  const next = (value as string) || '';
                  setSelectedOrgOption(next || null);
                  setOrganizationInput(next);
                }}
              >
                {availableOrganizations.map((org: any) => {
                  const value = org?.id || org?.slug || org?.name;
                  if (!value) {
                    return null;
                  }
                  const labelParts = [org?.slug || org?.name].filter(Boolean);
                  if (org?.id && org?.id !== value) {
                    labelParts.push(`(${org.id})`);
                  }
                  const label = labelParts.join(' ');
                  return (
                    <Option key={value} value={value}>
                      {label || value}
                    </Option>
                  );
                })}
              </Select>
            </FormControl>
          ) : (
            <Typography level="body-xs" sx={{ mt: 2 }}>
              We could not discover additional organizations automatically. You
              can still paste an organization ID manually below.
            </Typography>
          )}
          <form onSubmit={handleScopeSubmit}>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <FormControl>
                <FormLabel>Organization ID</FormLabel>
                <Input
                  placeholder="org_123"
                  value={organizationInput}
                  onChange={(event) => {
                    setOrganizationInput(event.target.value);
                    setSelectedOrgOption(event.target.value || null);
                  }}
                  autoFocus={availableOrganizations.length === 0}
                />
              </FormControl>
              {scopeError ? (
                <Alert color="danger" variant="soft">
                  {scopeError}
                </Alert>
              ) : null}
              {scopeSuccess ? (
                <Alert color="success" variant="soft">
                  {scopeSuccess}
                </Alert>
              ) : null}
              <Button type="submit" disabled={isScoping}>
                {isScoping ? 'Scoping...' : 'Update scope'}
              </Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </>
  );
}

export default function SidebarForGPUOrchestration({
  logsDrawerOpen,
  setLogsDrawerOpen,
  themeSetter,
}) {
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { models, isError, isLoading } = useModelStatus();
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);

  const DEV_MODE = experimentInfo?.name === 'dev';

  return (
    <Sheet
      className="Sidebar"
      sx={{
        gridArea: 'sidebar',
        borderRight: '1px solid',
        borderColor: 'divider',
        transition: 'transform 0.4s',
        zIndex: 100,
        height: '100%',
        overflow: 'auto',
        top: 0,
        pl: 1.2,
        pr: 1,
        py: 1,
        pt: '0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        userSelect: 'none',
        width: '100%',
        // opacity: 0.4,
        '& .lucide': {
          strokeWidth: '1.5px',
          width: '18px',
          height: '18px',
        },
        '& .MuiBadge-root': {},
      }}
    >
      <div
        style={{
          width: '100%',
          height: '52px',
          '-webkit-app-region': 'drag',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          color: 'var(--joy-palette-neutral-plainDisabledColor)',
        }}
      >
        {DEV_MODE && <>v{window.platform?.version}</>}
      </div>
      <SelectExperimentMenu models={models} />
      <ExperimentMenuItems
        DEV_MODE={DEV_MODE}
        experimentInfo={experimentInfo}
        models={models}
      />
      <GlobalMenuItems
        DEV_MODE={DEV_MODE}
        experimentInfo={experimentInfo}
        outdatedPluginsCount={outdatedPlugins?.length}
      />
      <BottomMenuItems themeSetter={themeSetter} />
    </Sheet>
  );
}
