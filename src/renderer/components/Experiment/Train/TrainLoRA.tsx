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
  ListItemDecorator,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  GraduationCapIcon,
  InfoIcon,
  LineChartIcon,
  Plug2Icon,
  PlusIcon,
  ScrollIcon,
  StopCircle,
  StopCircleIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';

import TrainingModalLoRA from './TrainingModalLoRA';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import LoRATrainingRunButton from './LoRATrainingRunButton';
import TensorboardModal from './TensorboardModal';
import ViewOutputModal from './ViewOutputModal';
import ImportRecipeModal from './ImportRecipeModal';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import CurrentDownloadBox from 'renderer/components/currentDownloadBox';
import DownloadProgressBox from 'renderer/components/Shared/DownloadProgressBox';
dayjs.extend(relativeTime);
var duration = require('dayjs/plugin/duration');
dayjs.extend(duration);

function formatTemplateConfig(config): ReactElement {
  const c = JSON.parse(config);

  // Remove the author/full path from the model name for cleanliness
  const short_model_name = c.model_name.split('/').pop();

  const r = (
    <>
      <b>Model:</b> {short_model_name} <br />
      <b>Dataset:</b> {c.dataset_name} <FileTextIcon size={14} />
      <br />
      {/* <b>Adaptor:</b> {c.adaptor_name} <br /> */}
      {/* {JSON.stringify(c)} */}
    </>
  );
  return r;
}

function jobChipColor(status: string): string {
  if (status === 'COMPLETE') return 'var(--joy-palette-success-200)';
  if (status === 'QUEUED') return 'var(--joy-palette-warning-200)';
  if (status === 'FAILED') return 'var(--joy-palette-danger-200)';
  if (status == 'STOPPED') return 'var(--joy-palette-warning-200)';
  if (status == 'RUNNING') return 'rgb(225,237,233)';

  return 'var(--joy-palette-neutral-200)';
}

function formatJobConfig(c): ReactElement {
  const r = (
    <>
      <b>Template:</b> {c?.job_data?.template_name || c?.job_data?.template_id}
      <br />
      <b>Model:</b> {c?.job_data?.model_name}
      <br />
      <b>Dataset:</b> {c?.job_data?.dataset}
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
  const [importRecipeModalOpen, setImportRecipeModalOpen] = useState(false);
  const [templateID, setTemplateID] = useState('-1');
  const [currentPlugin, setCurrentPlugin] = useState('');

  const [jobId, setJobId] = useState(null);
  const [downloadingModelName, setDownloadingModelName] = useState(null);

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

  useEffect(() => {
      fetch(chatAPI.Endpoints.Jobs.GetJobsOfType('DOWNLOAD_MODEL', 'RUNNING'))
        .then(async (response) => {
          const jobs = await response.json();
          if (jobs.length) {
            setJobId(jobs[0]?.id);
            setDownloadingModelName(jobs[0]?.job_data.model)
          }
        })
        .catch((e) => {
          console.log(e);
        });
    }, []);

  //Fetch available training plugins
  const {
    data: pluginsData,
    error: pluginsIsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    chatAPI.Endpoints.Experiment.ListScriptsOfType(
      experimentInfo?.id,
      'trainer' // type
      // 'model_architectures:' +
      //   experimentInfo?.config?.foundation_model_architecture //filter
    ),
    fetcher
  );

  const modelArchitecture =
    experimentInfo?.config?.foundation_model_architecture;

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
      <ImportRecipeModal
        open={importRecipeModalOpen}
        setOpen={setImportRecipeModalOpen}
        mutate={mutate}
      />
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <DownloadProgressBox jobId={jobId} assetName={downloadingModelName}/>
        {/* <Typography level="h1">Train</Typography> */}
        <Stack direction="row" justifyContent="space-between" gap={2}>
          <Typography level="title-md" startDecorator={<GraduationCapIcon />}>
            Training Templates
          </Typography>

          <Dropdown>
            <MenuButton
              color="primary"
              size="sm"
              startDecorator={<PlusIcon />}
              variant="solid"
            >
              New
            </MenuButton>
            <Menu sx={{ maxWidth: '300px' }}>
              <MenuItem disabled variant="soft" color="primary">
                <Typography level="title-sm">
                  Start from a pre-existing recipe:
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setImportRecipeModalOpen(true);
                }}
              >
                <ListItemDecorator>
                  <ScrollIcon />
                </ListItemDecorator>
                <Typography level="title-sm">Recipe Library</Typography>
              </MenuItem>
              <MenuItem disabled variant="soft" color="primary">
                <Typography level="title-sm">
                  Select a training plugin from the following list:
                </Typography>
              </MenuItem>
              {pluginsData?.map((plugin) => (
                <MenuItem
                  onClick={() => {
                    setTemplateID('-1');
                    setCurrentPlugin(plugin.uniqueId);
                    setOpen(true);
                  }}
                  key={plugin.uniqueId}
                  disabled={
                    !plugin.model_architectures?.includes(modelArchitecture)
                  }
                >
                  <ListItemDecorator>
                    <Plug2Icon />
                  </ListItemDecorator>
                  <div>
                    {plugin.name}
                    <Typography
                      level="body-xs"
                      sx={{ color: 'var(--joy-palette-neutral-400)' }}
                    >
                      {!plugin.model_architectures?.includes(modelArchitecture)
                        ? '(Does not support this model architecture)'
                        : ''}
                    </Typography>
                  </div>
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
              <th width="125px">Name</th>
              {/* <th>Description</th> */}
              <th width="150px">Plugin</th>
              <th width="400px">Config</th>
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
              {
                // Format of template data by column:
                // 0 = id, 1 = name, 2 = description, 3 = type, 4 = datasets, 5 = config, 6 = created, 7 = updated
                data &&
                  data?.map((row) => {
                    return (
                      <tr key={row[0]}>
                        <td>
                          <Typography
                            level="title-sm"
                            sx={{ overflow: 'clip' }}
                          >
                            {row[1]}
                          </Typography>
                        </td>
                        {/* <td>{row[2]}</td> */}
                        {/* <td>
                          {row[4]} <FileTextIcon size={14} />
                        </td> */}
                        <td style={{ overflow: 'clip' }}>
                          {JSON.parse(row[5])?.plugin_name}
                        </td>
                        <td style={{ overflow: 'hidden' }}>
                          {formatTemplateConfig(row[5])}
                        </td>
                        <td style={{}}>
                          <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                            <LoRATrainingRunButton
                              initialMessage="Queue"
                              trainingTemplate={{
                                template_id: row[0],
                                template_name: row[1],
                                model_name:
                                  JSON.parse(row[5])?.model_name || 'unknown',
                                dataset: row[4],
                                config: row[5],
                              }}
                              jobsMutate={jobsMutate}
                              experimentId={experimentInfo?.id}
                            />
                            <Button
                              onClick={() => {
                                setTemplateID(row[0]);
                                setCurrentPlugin(
                                  JSON.parse(row[5])?.plugin_name
                                );
                                setOpen(true);
                              }}
                              variant="outlined"
                              color="primary"
                            >
                              Edit
                            </Button>
                            <IconButton
                              onClick={async () => {
                                await fetch(
                                  chatAPI.Endpoints.Recipes.Export(row[0])
                                )
                                  .then((response) => response.blob())
                                  .then((blob) => {
                                    // Create blob link to download
                                    const url = window.URL.createObjectURL(
                                      new Blob([blob])
                                    );
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute(
                                      'download',
                                      `recipe.yaml`
                                    );

                                    // Append to html link, click and remove
                                    document.body.appendChild(link);
                                    link.click();
                                    link.parentNode.removeChild(link);
                                  });
                              }}
                            >
                              <DownloadIcon size="20px" />
                            </IconButton>
                            <IconButton
                              onClick={async () => {
                                confirm(
                                  'Are you sure you want to delete this Training Template?'
                                ) &&
                                  (await fetch(
                                    chatAPI.API_URL() +
                                      'train/template/' +
                                      row[0] +
                                      '/delete'
                                  ));
                                mutate();
                              }}
                            >
                              <Trash2Icon size="20px" />
                            </IconButton>
                          </ButtonGroup>
                        </td>
                      </tr>
                    );
                  })
              }
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
                <th style={{ width: '60px' }}>ID</th>
                <th>Details</th>
                <th>Status</th>
                <th style={{ width: '300px' }}></th>
              </tr>
            </thead>
            <tbody style={{ overflow: 'auto', height: '100%' }}>
              {jobs?.length > 0 &&
                jobs?.map((job) => {
                  return (
                    <tr key={job.id}>
                      <td>
                        <b>{job.id}</b>
                        <br />

                        <InfoIcon
                          onClick={() => {
                            alert(job?.job_data?.config);
                          }}
                          size="16px"
                          color="var(--joy-palette-neutral-500)"
                        />
                      </td>
                      <td>{formatJobConfig(job)}</td>
                      <td>
                        <Stack>
                          {job?.status == 'RUNNING' ? (
                            <>
                              <Stack
                                direction={'row'}
                                alignItems="center"
                                gap={1}
                              >
                                <Chip
                                  sx={{
                                    backgroundColor: jobChipColor(job.status),
                                    color: 'var(--joy-palette-neutral-800)',
                                  }}
                                >
                                  {job.status}
                                </Chip>
                                {job.progress == '-1'
                                  ? ''
                                  : Number.parseFloat(job.progress).toFixed(1) +
                                    '%'}
                                <LinearProgress
                                  determinate
                                  value={job.progress}
                                  sx={{ my: 1 }}
                                ></LinearProgress>
                                <IconButton
                                  color="danger"
                                  onClick={async () => {
                                    confirm(
                                      'Are you sure you want to stop this job?'
                                    ) &&
                                      (await fetch(
                                        chatAPI.Endpoints.Jobs.Stop(job.id)
                                      ));
                                  }}
                                >
                                  <StopCircleIcon size="20px" />
                                </IconButton>
                              </Stack>
                              {job?.job_data?.start_time && (
                                <>
                                  Started:{' '}
                                  {dayjs(job?.job_data?.start_time).fromNow()}
                                </>
                              )}
                            </>
                          ) : (
                            <Stack
                              direction={'column'}
                              justifyContent={'space-between'}
                            >
                              <>
                                <Chip
                                  sx={{
                                    backgroundColor: jobChipColor(job.status),
                                    color: 'var(--joy-palette-neutral-800)',
                                  }}
                                >
                                  {job.status}
                                  {job.progress == '-1'
                                    ? ''
                                    : ' - ' +
                                      Number.parseFloat(job.progress).toFixed(
                                        1
                                      ) +
                                      '%'}
                                </Chip>
                                {job?.job_data?.start_time && (
                                  <>
                                    Started:{' '}
                                    {dayjs(job?.job_data?.start_time).fromNow()}
                                  </>
                                )}
                                <br />
                                {job?.job_data?.end_time &&
                                  job?.job_data?.end_time && (
                                    <>
                                      Completed in:{' '}
                                      {dayjs
                                        .duration(
                                          dayjs(job?.job_data?.end_time).diff(
                                            dayjs(job?.job_data?.start_time)
                                          )
                                        )
                                        .humanize()}
                                    </>
                                  )}
                                <br />
                                {job?.status == 'COMPLETE' &&
                                  (job?.job_data?.completion_status ? (
                                    <>
                                      Final Training Status:{' '}
                                      {job?.job_data?.completion_status ==
                                      'success' ? (
                                        <Typography
                                          level="body-sm"
                                          color="success"
                                        >
                                          Success:{' '}
                                          {job?.job_data?.completion_details}
                                        </Typography>
                                      ) : (
                                        <Typography
                                          level="body-sm"
                                          color="danger"
                                        >
                                          Success:{' '}
                                          {job?.job_data?.completion_details}
                                        </Typography>
                                      )}
                                    </>
                                  ) : (
                                    /* If we don't have a status, assume it failed */
                                    <Typography level="body-sm" color="neutral">
                                      No job completion status. Training may
                                      have failed. View output for details
                                    </Typography>
                                  ))}
                              </>
                            </Stack>
                          )}
                        </Stack>
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
