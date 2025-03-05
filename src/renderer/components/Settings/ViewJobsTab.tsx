import * as React from 'react';
import {
  Typography,
  IconButton,
  Select,
  Option,
  Table,
  Box,
  Stack,
} from '@mui/joy';
import { RotateCcwIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

const jobTypes = [
  { value: 'NONE', label: 'None' },
  { value: '', label: 'All' },
  { value: 'DOWNLOAD_MODEL', label: 'Download Model' },
  { value: 'LOAD_MODEL', label: 'Load Model' },
  { value: 'TRAIN', label: 'Train' },
  { value: 'GENERATE', label: 'Generate' },
  { value: 'EVAL', label: 'Evaluate' },
];

export default function ViewJobsTab() {
  const [type, setType] = React.useState('');

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType(type, ''), fetcher);

  return (
    <>
      <Stack flexDirection="row" alignItems="center" marginBottom={2}>
        <Typography level="title-lg">View Jobs: &nbsp;</Typography>
        <Select
          sx={{ width: '200px' }}
          value={type}
          onChange={(e, newValue) => {
            setType(newValue);
          }}
        >
          {jobTypes.map((jobType) => (
            <Option key={jobType.value} value={jobType.value}>
              {jobType.label}
            </Option>
          ))}
        </Select>
        <IconButton onClick={() => jobsMutate()}>
          <RotateCcwIcon size="14px" />
        </IconButton>
      </Stack>
      <Box
        style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}
      >
        {type !== 'NONE' && (
          <Table
            stickyHeader
            sx={{ width: '100%', tableLayout: 'auto', overflow: 'scroll' }}
          >
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Job Type</th>
                <th>Job Status</th>
                <th>Job Progress</th>
                <th style={{ overflow: 'hidden' }}>Job Data</th>
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
                    <pre
                      style={{
                        maxHeight: '100px',
                        width: '500px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        scrollbarWidth: 'thin', // For Firefox
                        msOverflowStyle: 'none', // For Internet Explorer and Edge
                      }}
                    >
                      {JSON.stringify(job.job_data, null, 2)}
                    </pre>
                    <style>
                      {`
                      pre::-webkit-scrollbar {
                        width: 4px; /* For Chrome, Safari, and Opera */
                      }`}
                    </style>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Box>
    </>
  );
}
