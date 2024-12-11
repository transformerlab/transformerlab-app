/* eslint-disable jsx-a11y/anchor-is-valid */
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
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { EyeIcon, EyeOffIcon, RotateCcwIcon } from 'lucide-react';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TransformerLabSettings({}) {
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

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType(showJobsOfType, ''), fetcher);

  return (
    <>
      <Typography level="h1" marginBottom={3}>
        Transformer Lab Settings
      </Typography>
      <Sheet sx={{ width: '100%', overflow: 'auto' }}>
        <Typography level="title-lg" marginBottom={2}>
          Huggingface Credentials:
        </Typography>
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
                    var x = document.getElementsByName('hftoken')[0];
                    if (x.type === 'text') {
                      x.type = 'password';
                    } else {
                      x.type = 'text';
                    }
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
              await fetch(
                chatAPI.Endpoints.Config.Set(
                  'HuggingfaceUserAccessToken',
                  token
                )
              );
              // Now manually log in to huggingface
              await fetch(chatAPI.Endpoints.Models.HuggingFaceLogin());
              hftokenmutate(token);
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
            Documentation here:
            <a
              href="https://huggingface.co/docs/hub/security-tokens"
              target="_blank"
            >
              https://huggingface.co/docs/hub/security-tokens
            </a>
          </FormHelperText>
        </FormControl>
        <Divider sx={{ mt: 2, mb: 2 }} />{' '}
        <Typography level="title-lg" marginBottom={2}>
          Application:
        </Typography>
        <Button
          variant="soft"
          onClick={() => {
            // find and delete all items in local storage that begin with oneTimePopup:
            for (var key in localStorage) {
              if (key.startsWith('oneTimePopup')) {
                localStorage.removeItem(key);
              }
            }
          }}
        >
          Reset all Tutorial Popup Screens
        </Button>
        <Divider sx={{ mt: 2, mb: 2 }} />{' '}
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
