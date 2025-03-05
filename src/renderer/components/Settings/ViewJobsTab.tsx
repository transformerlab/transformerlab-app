import * as React from 'react';
import { Typography, IconButton, Select, Option, Table } from '@mui/joy';
import { RotateCcwIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ViewJobsTab() {
  const [showJobsOfType, setShowJobsOfType] = React.useState('NONE');

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType(showJobsOfType, ''), fetcher);

  return (
    <>
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
        <Option value="GENERATE">Generate</Option>
        <Option value="EVAL">Evaluate</Option>
      </Select>
      {showJobsOfType !== 'NONE' && (
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
              <th width="400px" style={{ overflow: 'hidden' }}>
                Job Data
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>{job.type}</td>
                <td>{job.status}</td>
                <td>{job.progress}</td>
                <td width="400px">
                  <pre>{JSON.stringify(job.job_data, null, 2)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
