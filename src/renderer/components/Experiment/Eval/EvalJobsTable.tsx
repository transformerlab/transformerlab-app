import {
  Box,
  Button,
  IconButton,
  ButtonGroup,
  Chip,
  Sheet,
  Table,
  Typography,
  Link,
} from '@mui/joy';
import {
  ChartColumnBigIcon,
  ChartColumnIncreasingIcon,
  FileDigitIcon,
  Grid3X3Icon,
  Trash2Icon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import dayjs from 'dayjs';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewCSVModal from './ViewCSVModal';
import ViewPlotModal from './ViewPlotModal';

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
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <ChartColumnBigIcon size="14px" style={{ marginRight: '3px' }} />{' '}
          {score?.type}: {score?.score.toFixed(5)}
        </span>
      </Chip>
      <br />
    </>
  ));
}

const EvalJobsTable = () => {
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [openCSVModal, setOpenCSVModal] = useState(false);
  const [openPlotModal, setOpenPlotModal] = useState(false);
  const [currentJobId, setCurrentJobId] = useState('');
  const [currentScore, setCurrentScore] = useState('');
  const [fileNameForDetailedReport, setFileNameForDetailedReport] =
    useState('');

  const fetchCSV = async (jobId) => {
    const response = await fetch(
      chatAPI.Endpoints.Experiment.GetAdditionalDetails(jobId)
    );
    const text = await response.text();
    return text;
  };

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType('EVAL', ''), fetcher, {
    refreshInterval: 2000,
  });

  const handleOpenCSVModal = (jobId) => {
    setCurrentJobId(jobId);
    setOpenCSVModal(true);
  };

  const handleOpenPlotModal = (jobId, score) => {
    setCurrentJobId(jobId);
    setCurrentScore(score);
    setOpenPlotModal(true);
  };

  useEffect(() => {
    // Component did mount logic here
  }, []);

  return (
    <>
      <ViewCSVModal
        open={openCSVModal}
        onClose={() => setOpenCSVModal(false)}
        jobId={currentJobId}
        fetchCSV={fetchCSV}
      />
      <ViewPlotModal
        open={openPlotModal}
        onClose={() => setOpenPlotModal(false)}
        jobId={currentJobId}
        score={currentScore}
      />
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
        setFileName={setFileNameForDetailedReport}
        fileName={fileNameForDetailedReport}
      />
      <Typography level="h3">Executions</Typography>
      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th width="50px">Id</th>
              <th>Eval</th>
              <th>Progress</th>
              <th>Score</th>
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
                  {job?.job_data?.additional_output_path &&
                    (job.job_data.additional_output_path
                      .toLowerCase()
                      .endsWith('.csv') ? (
                      <Link
                        onClick={() => handleOpenCSVModal(job?.id)}
                        sx={{ mt: 1, ml: 1 }}
                        startDecorator={<Grid3X3Icon size="14px" />}
                      >
                        Detailed Report
                      </Link>
                    ) : (
                      <Link
                        onClick={() => {
                          setFileNameForDetailedReport(
                            job?.job_data?.additional_output_path
                          );
                          setViewOutputFromJob(job?.id);
                        }}
                        sx={{ mt: 1, ml: 1 }}
                        startDecorator={<Grid3X3Icon size="14px" />}
                      >
                        Detailed Report
                      </Link>
                    ))}
                  {job?.job_data?.plot_data_path && (
                    <Link
                      onClick={() =>
                        handleOpenPlotModal(job?.id, job?.job_data?.score)
                      }
                      sx={{ mt: 1, ml: 1 }}
                      startDecorator={<ChartColumnIncreasingIcon size="14px" />}
                    >
                      Chart
                    </Link>
                  )}
                </td>

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

export default EvalJobsTable;
