import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Sheet,
  Table,
  Typography,
} from '@mui/joy';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import dayjs from 'dayjs';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';

const fetcher = (url) => fetch(url).then((res) => res.json());

const EvalJobsTable = () => {
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType('EVAL', ''), fetcher, {
    refreshInterval: 2000,
  });

  useEffect(() => {
    // Component did mount logic here
  }, []);

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
      />
      <Typography level="h2">Executions</Typography>
      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th width="50px">Id</th>
              <th>Eval</th>
              <th>Progress</th>
              <th>Started At</th>
              <th>Finished At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>
                  {job?.job_data?.plugin}
                  <br />
                  {job?.job_data?.evaluator}
                </td>
                <td>
                  <Chip>{job.status}</Chip>
                  <br />
                  Progress: {job?.progress}
                </td>
                <td>{String(dayjs(job?.created_at))}</td>
                <td>{String(dayjs(job?.updated_at))}</td>
                <td>
                  <ButtonGroup>
                    <Button
                      onClick={() => {
                        setViewOutputFromJob(job?.id);
                      }}
                    >
                      View Output
                    </Button>
                    <Button>Cancel</Button>
                  </ButtonGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {/* <Box sx={{ overflow: 'scroll' }}>
        <pre>{JSON.stringify(jobs, null, 2)}</pre>
      </Box> */}
      </Sheet>
    </Sheet>
  );
};

export default EvalJobsTable;
