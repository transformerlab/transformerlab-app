import * as React from 'react';
import Sheet from '@mui/joy/Sheet';
import {
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  IconButton,
  Input,
  Select,
  Option,
  Table,
  Typography,
  Alert,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Switch, // Import the Switch component
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { EyeIcon, EyeOffIcon, RotateCcwIcon, DownloadIcon } from 'lucide-react';
import { useNotification } from '../Shared/NotificationSystem';

import AIProvidersSettings from './AIProvidersSettings';
import EditTokenModal from './EditTokenModal';
import ViewJobsTab from './ViewJobsTab';
import UpdateSettings from './UpdateSettings';
import { alignBox } from '@nivo/core';
import {
  getAPIFullPath,
  useAPI,
  fetcher,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';

export default function TransformerLabSettings() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [doNotTrack, setDoNotTrack] = React.useState(false);
  const [showHuggingfaceEditTokenModal, setShowHuggingfaceEditTokenModal] =
    React.useState(false);
  const [showWandbEditTokenModal, setShowWandbEditTokenModal] =
    React.useState(false);
  const [showExperimentalPlugins, setShowExperimentalPlugins] =
    React.useState(false);
  const [hfTokenTeamWide, setHfTokenTeamWide] = React.useState(true);
  const [wandbTokenTeamWide, setWandbTokenTeamWide] = React.useState(true);
  const { addNotification } = useNotification();

  React.useEffect(() => {
    const fetchDoNotTrack = async () => {
      const value = await window.storage.get('DO_NOT_TRACK');
      setDoNotTrack(value === 'true');
    };
    fetchDoNotTrack();
  }, []);

  React.useEffect(() => {
    const fetchShowExperimental = async () => {
      const value = await window.storage.get('SHOW_EXPERIMENTAL_PLUGINS');
      setShowExperimentalPlugins(value === 'true');
    };
    fetchShowExperimental();
  }, []);

  const handleDoNotTrackChange = (event) => {
    const checked = event.target.checked;
    setDoNotTrack(checked);
    window.storage.set('DO_NOT_TRACK', checked.toString());
  };

  const handleShowExperimentalChange = (event) => {
    const checked = event.target.checked;
    setShowExperimentalPlugins(checked);
    window.storage.set('SHOW_EXPERIMENTAL_PLUGINS', checked.toString());
  };

  const {
    data: hftoken,
    error: hftokenerror,
    isLoading: hftokenisloading,
    mutate: hftokenmutate,
  } = useAPI('config', ['get'], {
    key: 'HuggingfaceUserAccessToken',
  });
  const {
    data: wandbToken,
    error: wandbTokenError,
    isLoading: wandbTokenIsLoading,
    mutate: wandbTokenMutate,
  } = useAPI('config', ['get'], {
    key: 'WANDB_API_KEY',
  });
  const [showJobsOfType, setShowJobsOfType] = React.useState('NONE');
  const [showProvidersPage, setShowProvidersPage] = React.useState(false);
  const [isRemoteMode, setIsRemoteMode] = React.useState(false);

  // Check if in remote mode from healthz endpoint
  React.useEffect(() => {
    const checkMode = async () => {
      try {
        const healthzData = await apiHealthz();
        setIsRemoteMode(healthzData?.mode !== 'local');
      } catch (error) {
        console.error('Error checking mode:', error);
      }
    };
    checkMode();
  }, []);

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType(showJobsOfType, ''), fetcher);

  const {
    data: canLogInToHuggingFace,
    error: canLogInToHuggingFaceError,
    isLoading: canLogInToHuggingFaceIsLoading,
    mutate: canLogInToHuggingFaceMutate,
  } = useSWR(chatAPI.Endpoints.Models.HuggingFaceLogin(), fetcher);

  const {
    data: wandbLoginStatus,
    error: wandbLoginStatusError,
    isLoading: wandbLoginStatusIsLoading,
    mutate: wandbLoginMutate,
  } = useSWR(chatAPI.Endpoints.Models.wandbLogin(), fetcher);

  if (showProvidersPage) {
    return (
      <AIProvidersSettings
        onBack={() => {
          setShowProvidersPage(false);
        }}
      />
    );
  }

  return (
    <Sheet
      sx={{
        width: '100%',
        height: '100%',
        overflowY: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1" marginBottom={1}>
        Transformer Lab Settings
      </Typography>
      <Sheet
        sx={{
          height: '100%',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          defaultValue={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <TabList>
            <Tab>Settings</Tab>
            {!isRemoteMode && <Tab>Updates</Tab>}
            <Tab>View Jobs</Tab>
          </TabList>
          <TabPanel value={0} style={{ overflow: 'auto' }}>
            {canLogInToHuggingFaceIsLoading && <CircularProgress />}
            <Typography level="title-lg" marginBottom={2}>
              Huggingface Credentials:
            </Typography>
            {canLogInToHuggingFace?.message?.startsWith('OK') ? (
              <div>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Alert color="success" style={{ width: '100%', margin: 0 }}>
                    Login to Huggingface Successful
                  </Alert>
                  <p
                    style={{
                      position: 'absolute',
                      right: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      margin: 0,
                      cursor: 'pointer',
                      fontSize: '14px',
                      borderBottom: '1px solid',
                    }}
                    onClick={() => {
                      setShowHuggingfaceEditTokenModal(
                        !showHuggingfaceEditTokenModal,
                      );
                    }}
                  >
                    Edit
                  </p>
                </div>
                <div>
                  {showHuggingfaceEditTokenModal && (
                    <EditTokenModal
                      open={showHuggingfaceEditTokenModal}
                      onClose={() => setShowHuggingfaceEditTokenModal(false)}
                      name="Huggingface"
                      token={hftoken}
                      onSave={async (token) => {
                        try {
                          if (!token || token.trim() === '') {
                            addNotification({
                              type: 'danger',
                              message: 'Please enter a token',
                            });
                            return;
                          }

                          // Logout first
                          await chatAPI.authenticatedFetch(
                            chatAPI.Endpoints.Models.HuggingFaceLogout(),
                          );

                          // Save the config
                          const saveResponse = await chatAPI.authenticatedFetch(
                            getAPIFullPath('config', ['set'], {
                              key: 'HuggingfaceUserAccessToken',
                              value: token,
                              team_wide: hfTokenTeamWide,
                            }),
                          );

                          if (!saveResponse.ok) {
                            const errorData = await saveResponse
                              .json()
                              .catch(() => ({}));
                            addNotification({
                              type: 'danger',
                              message:
                                errorData.message || 'Failed to save token',
                            });
                            return;
                          }

                          // Check login status
                          const loginResponse =
                            await chatAPI.authenticatedFetch(
                              chatAPI.Endpoints.Models.HuggingFaceLogin(),
                            );
                          const loginData = await loginResponse.json();

                          // Refetch the config and login status
                          // Use undefined to force revalidation
                          await hftokenmutate(undefined, { revalidate: true });
                          await canLogInToHuggingFaceMutate();

                          if (loginData.message?.startsWith('OK')) {
                            addNotification({
                              type: 'success',
                              message: `Token saved successfully (${hfTokenTeamWide ? 'team-wide' : 'user-specific'})`,
                            });
                          } else {
                            addNotification({
                              type: 'warning',
                              message:
                                loginData.message ||
                                'Token saved but login check failed',
                            });
                          }

                          setShowHuggingfaceEditTokenModal(false);
                        } catch (error) {
                          console.error(
                            'Error saving HuggingFace token:',
                            error,
                          );
                          addNotification({
                            type: 'danger',
                            message: `Failed to save token: ${(error as Error).message}`,
                          });
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <>
                <Alert color="danger" sx={{ mb: 1 }}>
                  Login to Huggingface Failed. Please set credentials below.
                </Alert>
                <FormControl sx={{ maxWidth: '500px' }}>
                  <FormLabel>User Access Token</FormLabel>
                  {hftokenisloading ? (
                    <CircularProgress />
                  ) : (
                    <Input
                      name="hftoken"
                      defaultValue={hftoken}
                      type="password"
                      endDecorator={
                        <IconButton
                          onClick={() => {
                            const x = document.getElementsByName('hftoken')[0];
                            x.type = x.type === 'text' ? 'password' : 'text';
                            setShowPassword(!showPassword);
                          }}
                        >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </IconButton>
                      }
                    />
                  )}
                  <FormControl
                    orientation="horizontal"
                    sx={{ mt: 1, gap: 1, alignItems: 'center' }}
                  >
                    <FormLabel sx={{ mr: 1 }}>
                      {hfTokenTeamWide
                        ? 'Team-wide (all members can use)'
                        : 'User-specific (only you)'}
                    </FormLabel>
                    <Switch
                      checked={hfTokenTeamWide}
                      onChange={(e) => setHfTokenTeamWide(e.target.checked)}
                    />
                  </FormControl>
                  <Button
                    onClick={async () => {
                      try {
                        const token =
                          document.getElementsByName('hftoken')[0].value;
                        if (!token || token.trim() === '') {
                          addNotification({
                            type: 'danger',
                            message: 'Please enter a token',
                          });
                          return;
                        }

                        // Save the config
                        const saveResponse = await chatAPI.authenticatedFetch(
                          getAPIFullPath('config', ['set'], {
                            key: 'HuggingfaceUserAccessToken',
                            value: token,
                            team_wide: hfTokenTeamWide,
                          }),
                        );

                        if (!saveResponse.ok) {
                          const errorData = await saveResponse
                            .json()
                            .catch(() => ({}));
                          addNotification({
                            type: 'danger',
                            message:
                              errorData.message || 'Failed to save token',
                          });
                          return;
                        }

                        // Check login status
                        const loginResponse = await chatAPI.authenticatedFetch(
                          chatAPI.Endpoints.Models.HuggingFaceLogin(),
                        );
                        const loginData = await loginResponse.json();

                        // Refetch the config and login status
                        await hftokenmutate();
                        await canLogInToHuggingFaceMutate();

                        if (loginData.message?.startsWith('OK')) {
                          addNotification({
                            type: 'success',
                            message: `Token saved successfully (${hfTokenTeamWide ? 'team-wide' : 'user-specific'})`,
                          });
                        } else {
                          addNotification({
                            type: 'warning',
                            message:
                              loginData.message ||
                              'Token saved but login check failed',
                          });
                        }
                      } catch (error) {
                        console.error('Error saving HuggingFace token:', error);
                        addNotification({
                          type: 'danger',
                          message: `Failed to save token: ${(error as Error).message}`,
                        });
                      }
                    }}
                    sx={{ marginTop: 1, width: '100px', alignSelf: 'flex-end' }}
                  >
                    Save
                  </Button>
                  <FormHelperText>
                    A Huggingface access token is required in order to access
                    certain models and datasets (those marked as "Gated").
                  </FormHelperText>
                  <FormHelperText>
                    Documentation here:{' '}
                    <a
                      href="https://huggingface.co/docs/hub/security-tokens"
                      target="_blank"
                      rel="noreferrer"
                    >
                      https://huggingface.co/docs/hub/security-tokens
                    </a>
                  </FormHelperText>
                </FormControl>
              </>
            )}
            {wandbLoginStatus?.message?.startsWith('OK') ? (
              <div>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Alert color="success" style={{ width: '100%', margin: 0 }}>
                    Login to Weights &amp; Biases Successful
                  </Alert>
                  <p
                    style={{
                      position: 'absolute',
                      right: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      margin: 0,
                      cursor: 'pointer',
                      fontSize: '14px',
                      borderBottom: '1px solid',
                    }}
                    onClick={() => {
                      setShowWandbEditTokenModal(!showWandbEditTokenModal);
                    }}
                  >
                    Edit
                  </p>
                </div>

                <div>
                  {showWandbEditTokenModal && (
                    <EditTokenModal
                      open={showWandbEditTokenModal}
                      onClose={() => setShowWandbEditTokenModal(false)}
                      name="Weights &amp; Biases"
                      token={wandbToken || ''}
                      onSave={async (token) => {
                        try {
                          if (!token || token.trim() === '') {
                            addNotification({
                              type: 'danger',
                              message: 'Please enter a token',
                            });
                            return;
                          }

                          // Save the config
                          const saveResponse = await chatAPI.authenticatedFetch(
                            getAPIFullPath('config', ['set'], {
                              key: 'WANDB_API_KEY',
                              value: token,
                              team_wide: wandbTokenTeamWide,
                            }),
                          );

                          if (!saveResponse.ok) {
                            const errorData = await saveResponse
                              .json()
                              .catch(() => ({}));
                            addNotification({
                              type: 'danger',
                              message:
                                errorData.message || 'Failed to save token',
                            });
                            return;
                          }

                          // Check login status
                          const loginResponse =
                            await chatAPI.authenticatedFetch(
                              chatAPI.Endpoints.Models.wandbLogin(),
                            );
                          const loginData = await loginResponse.json();

                          // Refetch the config and login status
                          // Use undefined to force revalidation
                          await wandbTokenMutate(undefined, {
                            revalidate: true,
                          });
                          await wandbLoginMutate();

                          if (loginData.message?.startsWith('OK')) {
                            addNotification({
                              type: 'success',
                              message: `Token saved successfully (${wandbTokenTeamWide ? 'team-wide' : 'user-specific'})`,
                            });
                          } else {
                            addNotification({
                              type: 'warning',
                              message:
                                loginData.message ||
                                'Token saved but login check failed',
                            });
                          }

                          setShowWandbEditTokenModal(false);
                        } catch (error) {
                          console.error('Error saving WANDB token:', error);
                          addNotification({
                            type: 'danger',
                            message: `Failed to save token: ${(error as Error).message}`,
                          });
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <FormControl sx={{ maxWidth: '500px', mt: 2 }}>
                <FormLabel>Weights &amp; Biases API Key</FormLabel>
                <Input name="wandbToken" type="password" />
                <FormControl
                  orientation="horizontal"
                  sx={{ mt: 1, gap: 1, alignItems: 'center' }}
                >
                  <FormLabel sx={{ mr: 1 }}>
                    {wandbTokenTeamWide
                      ? 'Team-wide (all members can use)'
                      : 'User-specific (only you)'}
                  </FormLabel>
                  <Switch
                    checked={wandbTokenTeamWide}
                    onChange={(e) => setWandbTokenTeamWide(e.target.checked)}
                  />
                </FormControl>
                <Button
                  onClick={async () => {
                    const token =
                      document.getElementsByName('wandbToken')[0].value;
                    await chatAPI.authenticatedFetch(
                      getAPIFullPath('config', ['set'], {
                        key: 'WANDB_API_KEY',
                        value: token,
                        team_wide: wandbTokenTeamWide,
                      }),
                    );
                    await chatAPI.authenticatedFetch(
                      chatAPI.Endpoints.Models.wandbLogin(),
                    );
                    wandbLoginMutate();
                  }}
                  sx={{ marginTop: 1, width: '100px', alignSelf: 'flex-end' }}
                >
                  Save
                </Button>
              </FormControl>
            )}
            <Divider sx={{ mt: 2, mb: 2 }} />
            <Typography level="title-lg" marginBottom={2}>
              AI Providers & Models:
            </Typography>
            <Button variant="soft" onClick={() => setShowProvidersPage(true)}>
              Set API Keys for AI Providers
            </Button>

            <Divider sx={{ mt: 2, mb: 2 }} />
            <Typography level="title-lg" marginBottom={2}>
              Application:
            </Typography>
            <Button
              variant="soft"
              onClick={() => {
                // find and delete all items in local storage that begin with oneTimePopup:
                for (const key in localStorage) {
                  if (key.startsWith('oneTimePopup')) {
                    localStorage.removeItem(key);
                  }
                }
              }}
            >
              Reset all Tutorial Popup Screens
            </Button>
            <Divider sx={{ mt: 2, mb: 2 }} />
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Do Not Share Any Data</FormLabel>
              <Switch
                checked={doNotTrack}
                onChange={handleDoNotTrackChange}
                color={doNotTrack ? 'success' : 'neutral'}
                sx={{ alignSelf: 'flex-start' }}
              />
              <FormHelperText>
                {doNotTrack
                  ? 'No tracking events will be sent'
                  : 'Anonymous usage data will be shared with Transformer Lab'}
                . Restart app to apply changes.
              </FormHelperText>
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Show Experimental Plugins</FormLabel>
              <Switch
                checked={showExperimentalPlugins}
                onChange={handleShowExperimentalChange}
                sx={{ alignSelf: 'flex-start' }}
                color={showExperimentalPlugins ? 'success' : 'neutral'}
              />
              <FormHelperText>
                {showExperimentalPlugins
                  ? 'Experimental plugins will be visible in the Plugin Gallery.'
                  : 'Experimental plugins will be hidden from the Plugin Gallery.'}
              </FormHelperText>
            </FormControl>
            <Divider sx={{ mt: 2, mb: 2 }} />
            <Button
              variant="soft"
              startDecorator={<DownloadIcon />}
              onClick={async () => {
                try {
                  const response = await chatAPI.authenticatedFetch(
                    getAPIFullPath('server', ['download_logs'], {}),
                  );

                  if (!response.ok) {
                    // Check if it's a 404 (no log files)
                    if (response.status === 404) {
                      const errorData = await response.json();
                      addNotification({
                        type: 'warning',
                        message:
                          errorData.detail ||
                          'No log files found. The log files may not have been created yet.',
                      });
                      return;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }

                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');

                  // Get filename from Content-Disposition header or use default
                  const contentDisposition = response.headers.get(
                    'Content-Disposition',
                  );
                  let filename = 'transformerlab_logs.zip';
                  if (contentDisposition) {
                    const filenameMatch =
                      contentDisposition.match(/filename="?(.+?)"?$/i);
                    if (filenameMatch) {
                      filename = filenameMatch[1];
                    }
                  }

                  link.download = filename;
                  link.href = url;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);

                  addNotification({
                    type: 'success',
                    message: 'API logs downloaded successfully',
                  });
                } catch (error) {
                  console.error('Error downloading logs:', error);
                  addNotification({
                    type: 'danger',
                    message: `Failed to download logs: ${error.message}`,
                  });
                }
              }}
              sx={{ mt: 2 }}
            >
              Download API Logs
            </Button>
          </TabPanel>
          {!isRemoteMode && (
            <TabPanel value={1} style={{ overflow: 'auto' }}>
              <UpdateSettings />
            </TabPanel>
          )}
          <TabPanel
            value={isRemoteMode ? 1 : 2}
            sx={{
              overflowY: 'hidden',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <ViewJobsTab />
          </TabPanel>
        </Tabs>
      </Sheet>
    </Sheet>
  );
}
