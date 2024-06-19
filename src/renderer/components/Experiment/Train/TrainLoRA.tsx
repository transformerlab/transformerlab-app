/* eslint-disable prefer-template */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import {
  Button,
  ButtonGroup,
  Chip,
  Dropdown,
  IconButton,
  LinearProgress,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  LineChartIcon,
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
      <b>Template ID:</b> {c?.template_name}
      <br />
      <b>Model:</b> {c?.model_name}
      <br />
      <b>Dataset:</b> {c?.dataset_name}
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
  const [templateID, setTemplateID] = useState('-1');
  const [currentPlugin, setCurrentPlugin] = useState('');

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.GET_TRAINING_TEMPLATE_URL(),
    fetcher
  );
  useEffect(() => {
    mutate();
  }, [data]);
  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType('TRAIN', ''), fetcher, {
    refreshInterval: 2000,
  });

  //Fetch available training plugins
  const {
    data: pluginsData,
    error: pluginsIsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    chatAPI.Endpoints.Experiment.ListScriptsOfType(
      experimentInfo?.id,
      'trainer', // type
      'model_architectures:' +
        experimentInfo?.config?.foundation_model_architecture //filter
    ),
    fetcher
  );

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
        template_id={Number(templateID) > -1 ? templateID : undefined}
        pluginId={currentPlugin}
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

          <Dropdown>
            <MenuButton startDecorator={<PlusCircleIcon />} variant="solid">
              New
            </MenuButton>
            <Menu>
              {pluginsData?.map((plugin) => (
                <MenuItem
                  onClick={() => {
                    setTemplateID('-1');
                    setCurrentPlugin(plugin.uniqueId);
                    setOpen(true);
                  }}
                >
                  {plugin.name}
                </MenuItem>
              ))}
            </Menu>
          </Dropdown>
        </Stack>
        <Sheet
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
              <th width="150px">Name</th>
              {/* <th>Description</th> */}
              <th width="100px">Dataset</th>
              <th width="400px">Data</th>
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
                      {/* <td>{row[2]}</td> */}
                      <td>
                        {row[4]} <FileTextIcon size={14} />
                      </td>
                      <td style={{ overflow: 'clip' }}>
                        {formatTemplateConfig(row[5])}
                      </td>
                      <td style={{}}>
                        <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                          <LoRATrainingRunButton
                            initialMessage="Queue"
                            trainingTemplateId={row[0]}
                            jobsMutate={jobsMutate}
                            experimentId={experimentInfo?.id}
                          />
                          <Button
                            onClick={() => {
                              setTemplateID(row[0]);
                              setCurrentPlugin(JSON.parse(row[5])?.plugin_name);
                              setOpen(true);
                            }}
                            variant="plain"
                          >
                            Edit
                          </Button>
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
                        </ButtonGroup>
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
        <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
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
              {jobs?.length > 0 &&
                jobs?.map((job) => {
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
                          {job.progress == '-1'
                            ? ''
                            : ' - ' +
                              Number.parseFloat(job.progress).toFixed(1) +
                              '%'}
                        </Chip>
                        <br />
                        <br />
                        <LinearProgress determinate value={job.progress} />
                      </td>
                      <td style={{}}>
                        <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                          {job?.job_data?.tensorboard_output_dir && (
                            <Button
                              size="sm"
                              variant="plain"
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
                            variant="plain"
                            onClick={() => {
                              setViewOutputFromJob(job?.id);
                            }}
                          >
                            Output
                          </Button>
                          <IconButton variant="plain">
                            <Trash2Icon
                              onClick={async () => {
                                await fetch(
                                  chatAPI.Endpoints.Jobs.Delete(job.id)
                                );
                                jobsMutate();
                              }}
                            />
                          </IconButton>
                        </ButtonGroup>
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
