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
  Modal,
  ModalDialog,
  ModalClose,
} from '@mui/joy';
import {
  ChartColumnBigIcon,
  FileDigitIcon,
  Trash2Icon,
  Grid3X3Icon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import dayjs from 'dayjs';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewCSVModal from './ViewCSVModal';
import DatasetTable from 'renderer/components/Data/DatasetTable';

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
  const [currentJob, setCurrentJob] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);

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

  const handleOpenCSVModal = (job) => {
    console.log('Dataset Preview clicked – job_data:', job.job_data);
    setCurrentJobId(job.id);
    setCurrentJob(job);
    setOpenCSVModal(true);
  };

  const fetchGenerateCSV = async (jobId) => {
    const response = await fetch(
      chatAPI.Endpoints.Experiment.GetGeneratedDataset(jobId),
    );
    const text = await response.text();
    return text;
  };

  return (
    <>
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
      />
      {openCSVModal && currentJob && (
        <Modal open={openCSVModal} onClose={() => setOpenCSVModal(false)}>
          <ModalDialog sx={{ width: '90vw', height: '90vh' }}>
            <ModalClose />
            <Typography level="h4" mb={2}>
              Dataset Preview – Job #{currentJob.id}
            </Typography>
            <Box sx={{ overflow: 'auto', height: '100%' }}>
              <DatasetTable datasetId={currentJob.job_data.dataset_id} />
            </Box>
          </ModalDialog>
        </Modal>
      )}
      <Typography level="h3">Executions</Typography>
      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th width="50px">Id</th>
              <th>Generation</th>
              <th>Progress</th>
              <th>Dataset</th>
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
                <td>
                  {/* <RenderScore score={job?.job_data?.score} /> */}
                  <Link
                    onClick={() => handleOpenCSVModal(job)}
                    sx={{ mt: 1, ml: 1 }}
                    startDecorator={<Grid3X3Icon size="14px" />}
                  >
                    Dataset Preview
                  </Link>
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

export default GenerateJobsTable;
