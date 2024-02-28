/* eslint-disable prefer-template */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { ReactElement, useState } from 'react';
import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  LineChartIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
} from 'lucide-react';

import TrainingModalLoRA from './TrainingModalLoRA';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import LoRATrainingRunButton from './LoRATrainingRunButton';
import TensorboardModal from './TensorboardModal';
import ViewOutputModal from './ViewOutputModal';

function formatTemplateConfig(config): ReactElement {
  const c = JSON.parse(config);

  const r = (
    <>
      <b>Model:</b> {c.model_name}
      <br />
      <b>Plugin:</b> {c.plugin_name} <br />
      <b>Dataset:</b> {c.dataset_name} <br />
      <b>Adaptor:</b> {c.adaptor_name} <br />
      {/* {JSON.stringify(c)} */}
    </>
  );
  return r;
}

function jobChipColor(status: string): string {
  if (status === 'COMPLETE') return 'success';
  if (status === 'QUEUED') return 'warning';
  if (status === 'FAILED') return 'danger';

  return 'neutral';
}

function formatJobConfig(c): ReactElement {
  const r = (
    <>
      {/* {JSON.stringify(c)} */}
      <b>Template ID:</b> {c.template_name}
      <br />
      <b>Model Name:</b> {c.model_name}
      <br />
      <b>Dataset Name:</b> {c.dataset_name}
    </>
  );
  return r;
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TrainLoRA({ experimentInfo }) {
  const [open, setOpen] = useState(false);
  const [currentTensorboardForModal, setCurrentTensorboardForModal] =
    useState(-1);
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.GET_TRAINING_TEMPLATE_URL(),
    fetcher
  );

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.API_URL() + 'train/jobs', fetcher, {
    refreshInterval: 1000,
  });

  if (!experimentInfo) {
    return 'No experiment selected';
  }

  return (
    <>
      <TrainingModalLoRA
        open={open}
        onClose={() => {
          setOpen(false);
          mutate();
        }}
        experimentInfo={experimentInfo}
      />
      <TensorboardModal
        currentTensorboard={currentTensorboardForModal}
        setCurrentTensorboard={setCurrentTensorboardForModal}
      />
      <ViewOutputModal
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
      />
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* <Typography level="h1">Train</Typography> */}
        <Stack direction="row" justifyContent="space-between" gap={2}>
          <Typography level="title-md" startDecorator={<GraduationCapIcon />}>
            Training Templates
          </Typography>
          <Button
            onClick={() => setOpen(true)}
            startDecorator={<PlusCircleIcon />}
            sx={{ width: 'fit-content' }}
            size="md"
          >
            New
          </Button>
        </Stack>

        <Sheet
          color="neutral"
          variant="soft"
          sx={{
            px: 1,
            mt: 1,
            mb: 2,
            flex: 1,
            height: '100%',
            overflow: 'auto',
          }}
        >
          <Table>
            <thead>
              <th>Name</th>
              <th>Description</th>
              <th>Dataset</th>
              <th>Data</th>
              <th style={{ textAlign: 'right' }}>&nbsp;</th>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td>loading...</td>
                </tr>
              )}
              {error && (
                <tr>
                  <td>error...</td>
                </tr>
              )}
              {data &&
                data?.map((row) => {
                  return (
                    <tr key={row[0]}>
                      <td>
                        <Typography level="title-sm">{row[1]}</Typography>
                      </td>
                      <td>{row[2]}</td>
                      <td>
                        {row[4]} <FileTextIcon size={14} />
                      </td>
                      <td style={{ overflow: 'clip' }}>
                        {formatTemplateConfig(row[5])}
                      </td>
                      <td
                        style={{
                          display: 'flex',
                          gap: 2,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <LoRATrainingRunButton
                          initialMessage="Queue"
                          trainingTemplateId={row[0]}
                          jobsMutate={jobsMutate}
                          experimentId={experimentInfo?.id}
                        />
                        <IconButton
                          onClick={async () => {
                            await fetch(
                              chatAPI.API_URL() +
                                'train/template/' +
                                row[0] +
                                '/delete'
                            );
                            mutate();
                          }}
                        >
                          <Trash2Icon />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </Sheet>
        <Typography level="title-md" startDecorator={<ClockIcon />}>
          Queued Training Jobs
        </Typography>
        {/* <pre>{JSON.stringify(jobs, '\n', 2)}</pre> */}
        {/* <Typography level="body2">
          Current Foundation: {experimentInfo?.config?.foundation}
        </Typography> */}
        {/* <ButtonGroup variant="soft">
          <Button
            onClick={() => {
              fetch(chatAPI.API_URL() + 'train/job/start_next');
            }}
            startDecorator={<PlayIcon />}
          >
            &nbsp;Start next Job
          </Button>
          <br />
          <Button
            color="danger"
            startDecorator={<Trash2Icon />}
            onClick={() => {
              fetch(chatAPI.API_URL() + 'train/job/delete_all');
            }}
          >
            Delete all Jobs
          </Button>
        </ButtonGroup> */}
        <Sheet
          color="warning"
          variant="soft"
          sx={{ px: 1, mt: 1, mb: 2, flex: 1, overflow: 'auto' }}
        >
          {/* <pre>{JSON.stringify(jobs, '\n', 2)}</pre> */}
          <Table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody style={{ overflow: 'auto', height: '100%' }}>
              {jobs?.map((job) => {
                return (
                  <tr key={job.id}>
                    <td>
                      {/* {JSON.stringify(job)} */}
                      <b>{job.id}-</b> {job.type}
                    </td>
                    <td>{formatJobConfig(job.config)}</td>
                    <td>
                      <Chip color={jobChipColor(job.status)}>
                        {job.status}
                        {job.progress == '-1' ? '' : ' - ' + job.progress + '%'}
                      </Chip>
                      <br />
                      <br />
                      <LinearProgress determinate value={job.progress} />
                    </td>
                    <td
                      style={{
                        display: 'flex',
                        gap: 2,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                    >
                      {job?.job_data?.tensorboard_output_dir && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setCurrentTensorboardForModal(job?.id);
                          }}
                          startDecorator={<LineChartIcon />}
                        >
                          Tensorboard
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => {
                          setViewOutputFromJob(job?.id);
                        }}
                      >
                        Output
                      </Button>
                      <IconButton variant="soft">
                        <Trash2Icon
                          onClick={async () => {
                            await fetch(
                              chatAPI.API_URL() + 'train/job/delete/' + job.id
                            );
                            jobsMutate();
                          }}
                        />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Sheet>
      </Sheet>
    </>
  );
}
