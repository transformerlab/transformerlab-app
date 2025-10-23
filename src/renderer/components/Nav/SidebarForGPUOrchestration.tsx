import { useNavigate } from 'react-router-dom';
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
  LogInIcon,
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
  logout,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  API_URL,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';

import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';
import UserLoginModal from '../User/UserLoginModal';
import { DEFAULT_API_FALLBACK } from '../User/authCallbackUtils';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

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
        disabled
      />
      <SubNavItem
        title="Generate"
        path="/experiment/generate"
        icon={<SquareStackIcon />}
        disabled
      />
      <SubNavItem
        title="Evaluate"
        path="/experiment/eval"
        icon={<ChartColumnIncreasingIcon />}
        disabled
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

// WorkOS login function extracted from UserLoginModal
async function loginWithWorkOS() {
  try {
    const w: any = window as any;
    const fallbackBase = DEFAULT_API_FALLBACK;
    const apiBase =
      (API_URL && API_URL()) || w.TransformerLab?.API_URL || fallbackBase;
    // Add a cache-buster to avoid browsers (or proxies) returning 304 with HTML body
    const cacheBuster = Date.now().toString();
    const authorizeEndpoint = `${apiBase}auth/login-url?cb=${cacheBuster}`;

    const resp = await fetch(authorizeEndpoint, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, */*;q=0.8',
      },
    });

    if (resp.status === 304) {
      // Treat 304 as an error for this JSON-init endpoint; force retry logic by clearing state
      await w.storage.delete('authWorkosState');
      throw new Error(
        'Failed to initiate SSO (stale cached response). Please try again.',
      );
    }

    if (!resp.ok) {
      await w.storage.delete('authWorkosState');
      throw new Error(`Failed to initiate SSO (HTTP ${resp.status}).`);
    }

    let data: any = null;
    const contentType = resp.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        // If HTML came back, this is unexpected
        if (
          text.trim().startsWith('<!DOCTYPE') ||
          text.trim().startsWith('<html')
        ) {
          throw new Error('Server returned HTML instead of JSON.');
        }
        // Attempt a lenient parse
        try {
          data = JSON.parse(text);
        } catch {
          data = { detail: 'Unexpected response format.' };
        }
      }
    } catch (parseErr) {
      await w.storage.delete('authWorkosState');
      throw new Error('SSO start failed: ' + parseErr);
    }
    const redirectTo = data?.login_url || data?.authorization_url;
    if (redirectTo) {
      try {
        const redirectUrl = new URL(redirectTo);
        const stateFromQuery = redirectUrl.searchParams.get('state');
        const hash = redirectUrl.hash || '';
        const stateFromHash = hash
          ? new URLSearchParams(
              hash.startsWith('#') ? hash.slice(1) : hash,
            ).get('state')
          : null;
        const stateValue =
          stateFromQuery || stateFromHash || data?.state || null;
        if (stateValue) {
          await w.storage.set('authWorkosState', stateValue);
        } else {
          await w.storage.delete('authWorkosState');
        }
      } catch {
        await w.storage.delete('authWorkosState');
      }
      window.location.href = redirectTo;
    } else {
      await w.storage.delete('authWorkosState');
      throw new Error(data?.detail || 'Failed to initiate SSO.');
    }
  } catch (e) {
    const w: any = window as any;
    await w.storage.delete('authWorkosState');
    throw new Error('SSO start failed: ' + e);
  }
}

function BottomMenuItems({ navigate, themeSetter }) {
  const [userLoginModalOpen, setUserLoginModalOpen] = useState(false);
  const [workosScopeModalOpen, setWorkosScopeModalOpen] = useState(false);
  const [selectedOrgOption, setSelectedOrgOption] = useState<string | null>(
    null,
  );
  const [organizationInput, setOrganizationInput] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeSuccess, setScopeSuccess] = useState<string | null>(null);
  const [isScoping, setIsScoping] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const {
    data: userInfo,
    error: userError,
    mutate: userMutate,
  } = useAPI('auth', ['me'], {});

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

      const response = await fetch(`${apiBase}auth/workos/scope`, {
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

  if (userError) {
    console.log(userError);
  }

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
        ) : (
          <List
            sx={{
              '--ListItem-radius': '6px',
              '--ListItem-minHeight': '32px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            <ListItem className="FirstSidebar_Content">
              <ListItemButton
                variant="plain"
                disabled={isLoggingIn}
                onClick={async () => {
                  if (isLoggingIn) return; // Prevent multiple clicks

                  setIsLoggingIn(true);
                  try {
                    // Check if we're in cloud mode
                    if (window.platform?.appmode === 'cloud') {
                      try {
                        await loginWithWorkOS();
                      } catch (error) {
                        console.error('Login failed:', error);
                        // You could add a toast notification here if needed
                      }
                    } else {
                      // Open the modal for non-cloud modes
                      setUserLoginModalOpen(true);
                    }
                  } finally {
                    setIsLoggingIn(false);
                  }
                }}
              >
                <ListItemDecorator sx={{ minInlineSize: '30px' }}>
                  {isLoggingIn ? (
                    <Box
                      sx={{
                        width: '18px',
                        height: '18px',
                        border: '2px solid transparent',
                        borderTop: '2px solid currentColor',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                  ) : (
                    <LogInIcon />
                  )}
                </ListItemDecorator>
                <ListItemContent
                  sx={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignContent: 'center',
                  }}
                >
                  <Typography level="body-sm">
                    {isLoggingIn ? 'Logging in...' : 'Login'}
                  </Typography>
                </ListItemContent>
              </ListItemButton>
            </ListItem>
          </List>
        )}
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
      <UserLoginModal
        open={userLoginModalOpen}
        onClose={() => {
          setUserLoginModalOpen(false);
          userMutate();
        }}
      />
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

  const navigate = useNavigate();

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
      <BottomMenuItems navigate={navigate} themeSetter={themeSetter} />
    </Sheet>
  );
}
