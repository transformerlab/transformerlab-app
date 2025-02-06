import {
  Box,
  Button,
  IconButton,
  ButtonGroup,
  Chip,
  Sheet,
  Table,
  Typography,
} from '@mui/joy';
import { ChartColumnBigIcon, FileDigitIcon, Trash2Icon } from 'lucide-react';
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
      {' '}
      <Chip
        key={idx}
        color="success"
        variant="outlined"
        sx={{ marginRight: '4px' }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <ChartColumnBigIcon size="14px" style={{ marginRight: '3px' }} />{' '}
          {score?.type}: {score?.score.toFixed(5)}
        </span>
      </Chip>
      <br />
    </>
  ));
}



const GenerateJobsTable = () => {
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [openCSVModal, setOpenCSVModal] = useState(false);
  const [currentJobId, setCurrentJobId] = useState('');

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType('GENERATE', ''), fetcher, {
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
      <Typography level="h3">Executions</Typography>
      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th width="50px">Id</th>
              <th>Generation</th>
              <th>Progress</th>
              {/* <th>Score</th> */}
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>
                  {job?.job_data?.plugin}
                  <br />
                  {job?.job_data?.generator}
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
                {/* <td>
                  <RenderScore score={job?.job_data?.score} />
                  <Button
                    variant="outlined"
                    size="sm"
                    onClick={() => handleOpenCSVModal(job?.id)}
                  >
                    View CSV
                  </Button>
                </td> */}
                <td>
                  <ButtonGroup
                    variant="soft"
                    sx={{ justifyContent: 'flex-end' }}
                  >
                    <Button
                      onClick={() => {
                        setViewOutputFromJob(job?.id);
                      }}
                    >
                      View Output
                    </Button>
                    <IconButton variant="plain">
                      <Trash2Icon
                        onClick={async () => {
                          await fetch(chatAPI.Endpoints.Jobs.Delete(job?.id));
                          jobsMutate();
                        }}
                      />
                    </IconButton>
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

export default GenerateJobsTable;
