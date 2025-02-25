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
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { EyeIcon, EyeOffIcon, RotateCcwIcon } from 'lucide-react';

// Import the AIProvidersSettings component.
import AIProvidersSettings from './AIProvidersSettings';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TransformerLabSettings() {
  const [showPassword, setShowPassword] = React.useState(false);
  const {
    data: hftoken,
    error: hftokenerror,
    isLoading: hftokenisloading,
    mutate: hftokenmutate,
  } = useSWR(
    chatAPI.Endpoints.Config.Get('HuggingfaceUserAccessToken'),
    fetcher
  );
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

  if (showProvidersPage) {
    return (
      <AIProvidersSettings
        onBack={() => {
          setShowProvidersPage(false);
        }}
      />
    );
  }
  const {
    data: wandbLoginStatus,
    error: wandbLoginStatusError,
    isLoading: wandbLoginStatusIsLoading,
    mutate: wandbLoginMutate,
  } = useSWR(chatAPI.Endpoints.Models.testWandbLogin(), fetcher);

  return (
    <>
      <Typography level="h1" marginBottom={3}>
        Transformer Lab Settings
      </Typography>
      <Sheet sx={{ width: '100%', overflowY: 'auto' }}>
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
                  const token = document.getElementsByName('hftoken')[0].value;
                  await fetch(chatAPI.Endpoints.Config.Set('HuggingfaceUserAccessToken', token));
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
                A Huggingface access token is required in order to access certain
                models and datasets (those marked as "Gated").
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
        )}{" "}
        {wandbLoginStatus?.message === 'OK' ? (
          <Alert color="success">Login to Weights &amp; Biases Successful</Alert>
        ) : (
          <FormControl sx={{ maxWidth: '500px', mt: 2 }}>
            <FormLabel>Weights &amp; Biases API Key</FormLabel>
            <Input name="wandbToken" type="password" />
            <Button
              onClick={async () => {
                const token = document.getElementsByName('wandbToken')[0].value;
                await fetch(chatAPI.Endpoints.Config.Set('WANDB_API_KEY', token));
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
          Providers & Models:
        </Typography>
        {/* Clickable list option */}
        <Button variant="soft" onClick={() => setShowProvidersPage(true)}>
          AI Providers and Models
        </Button>
        {/* <Divider sx={{ mt: 2, mb: 2 }} />
        )}{' '}

        <FormControl sx={{ maxWidth: '500px', mt: 2 }}>
          <FormLabel>OpenAI API Key</FormLabel>
          <Input name="openaiKey" type="password" />
          <Button
            onClick={async () => {
              const token = document.getElementsByName('openaiKey')[0].value;
              await fetch(chatAPI.Endpoints.Config.Set('OPENAI_API_KEY', token));
              await fetch(chatAPI.Endpoints.Models.SetOpenAIKey());
              const response = await fetch(chatAPI.Endpoints.Models.CheckOpenAIAPIKey());
              const result = await response.json();
              if (result.message === 'OK') {
                alert('Successfully set OpenAI API Key');
              }
            }}
            sx={{ marginTop: 1, width: '100px', alignSelf: 'flex-end' }}
          >
            Save
          </Button>
        </FormControl>
        <FormControl sx={{ maxWidth: '500px', mt: 2 }}>
          <FormLabel>Anthropic API Key</FormLabel>
          <Input name="anthropicKey" type="password" />
          <Button
            onClick={async () => {
              const token = document.getElementsByName('anthropicKey')[0].value;
              await fetch(chatAPI.Endpoints.Config.Set('ANTHROPIC_API_KEY', token));
              await fetch(chatAPI.Endpoints.Models.SetAnthropicKey());
              const response = await fetch(chatAPI.Endpoints.Models.CheckAnthropicAPIKey());
              const result = await response.json();
              if (result.message === 'OK') {
                alert('Successfully set Anthropic API Key');
              }
            }}
            sx={{ marginTop: 1, width: '100px', alignSelf: 'flex-end' }}
          >
            Save
          </Button>
        </FormControl> */}
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
        <Typography level="title-lg" marginBottom={2}>
          View Jobs (debug):{' '}
          <IconButton onClick={() => jobsMutate()}>
            <RotateCcwIcon size="14px" />
          </IconButton>
        </Typography>
        <Select
          sx={{ width: '400px' }}
          value={showJobsOfType}
          onChange={(e, newValue) => {
            setShowJobsOfType(newValue);
          }}
        >
          <Option value="NONE">None</Option>
          <Option value="">All</Option>
          <Option value="DOWNLOAD_MODEL">Download Model</Option>
          <Option value="LOAD_MODEL">Load Model</Option>
          <Option value="TRAIN">Train</Option>
        </Select>
        {showJobsOfType !== 'NONE' && (
          <Table sx={{ tableLayout: 'auto', overflow: 'scroll' }}>
            <thead>
              <tr>
                <td>Job ID</td>
                <td>Job Type</td>
                <td>Job Status</td>
                <td>Job Progress</td>
                <td>Job Data</td>
              </tr>
            </thead>
            <tbody>
              {jobs?.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.type}</td>
                  <td>{job.status}</td>
                  <td>{job.progress}</td>
                  <td>
                    <pre>{JSON.stringify(job.job_data, null, 2)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Sheet>
    </>
  );
}
