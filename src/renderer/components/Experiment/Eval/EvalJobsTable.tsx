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

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { jobChipColor } from 'renderer/lib/utils';
import JobProgress from '../Train/JobProgress';
dayjs.extend(relativeTime);
var duration = require('dayjs/plugin/duration');
dayjs.extend(duration);

const fetcher = (url) => fetch(url).then((res) => res.json());

function RenderScore({ score }) {
  if (score === undefined) {
    return <Chip color="warning">Not available</Chip>;
  }
  if (score === null) {
    return <Chip color="danger">Failed</Chip>;
  }

  let scoreArray = [];
  try {
    scoreArray = JSON.parse(score);
  } catch {
    return <Chip color="danger">Failed</Chip>;
  }

  // if scoreArray is not an array, return the score as a string
  if (!Array.isArray(scoreArray)) {
    return JSON.stringify(scoreArray);
  }

  return scoreArray.map((score, idx) => (
    <>
      <Chip
        key={idx}
        color="success"
        variant="outlined"
        sx={{ marginRight: '4px' }}
      >
        {score?.type}: {score?.score}
      </Chip>
      <br />
    </>
  ));
}

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
    <>
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
              <th>Score</th>
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
                  <JobProgress job={job} />
                </td>
                {/* <td>
                  Started:&nbsp;
                  {String(dayjs(job?.created_at).fromNow())}
                  <br />
                  Completed in:&nbsp;
                  {dayjs
                    .duration(
                      dayjs(job?.updated_at).diff(dayjs(job?.created_at))
                    )
                    .humanize()}
                </td> */}
                <td>
                  <RenderScore score={job?.job_data?.score} />
                </td>
                <td>
                  <ButtonGroup variant="soft">
                    <Button
                      onClick={() => {
                        setViewOutputFromJob(job?.id);
                      }}
                    >
                      View Output
                    </Button>
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
    </>
  );
};

export default EvalJobsTable;
