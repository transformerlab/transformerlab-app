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
import useSWR from 'swr';
import { EyeIcon, EyeOffIcon, RotateCcwIcon } from 'lucide-react';

import AIProvidersSettings from './AIProvidersSettings';
import ViewJobsTab from './ViewJobsTab';
import { alignBox } from '@nivo/core';
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TransformerLabSettings() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [doNotTrack, setDoNotTrack] = React.useState(false);
  const [showExperimentalPlugins, setShowExperimentalPlugins] =
    React.useState(false);

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
  const [showJobsOfType, setShowJobsOfType] = React.useState('NONE');
  const [showProvidersPage, setShowProvidersPage] = React.useState(false);

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
  } = useSWR(chatAPI.Endpoints.Models.testWandbLogin(), fetcher);

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
            <Tab>View Jobs</Tab>
          </TabList>
          <TabPanel value={0} style={{ overflow: 'auto' }}>
            {canLogInToHuggingFaceIsLoading && <CircularProgress />}
            <Typography level="title-lg" marginBottom={2}>
              Huggingface Credentials:
            </Typography>
            {canLogInToHuggingFace?.message === 'OK' ? (
              <Alert color="success">Login to Huggingface Successful</Alert>
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
                  <Button
                    onClick={async () => {
                      const token =
                        document.getElementsByName('hftoken')[0].value;
                      await fetch(
                        getAPIFullPath('config', ['set'], {
                          key: 'HuggingfaceUserAccessToken',
                          value: token,
                        }),
                      );
                      // Now manually log in to Huggingface
                      await fetch(chatAPI.Endpoints.Models.HuggingFaceLogin());
                      hftokenmutate(token);
                      canLogInToHuggingFaceMutate();
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
            {wandbLoginStatus?.message === 'OK' ? (
              <Alert color="success">
                Login to Weights &amp; Biases Successful
              </Alert>
            ) : (
              <FormControl sx={{ maxWidth: '500px', mt: 2 }}>
                <FormLabel>Weights &amp; Biases API Key</FormLabel>
                <Input name="wandbToken" type="password" />
                <Button
                  onClick={async () => {
                    const token =
                      document.getElementsByName('wandbToken')[0].value;
                    await fetch(
                      getAPIFullPath('config', ['set'], {
                        key: 'WANDB_API_KEY',
                        value: token,
                      }),
                    );
                    await fetch(chatAPI.Endpoints.Models.wandbLogin());
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
          </TabPanel>
          <TabPanel
            value={1}
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
