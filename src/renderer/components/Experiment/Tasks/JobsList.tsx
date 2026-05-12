import React from 'react';
import Table from '@mui/joy/Table';
import Stack from '@mui/joy/Stack';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import ModalClose from '@mui/joy/ModalClose';
import Skeleton from '@mui/joy/Skeleton';
import Box from '@mui/joy/Box';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import MenuItem from '@mui/joy/MenuItem';
import Dropdown from '@mui/joy/Dropdown';
import Checkbox from '@mui/joy/Checkbox';
import Tooltip from '@mui/joy/Tooltip';
import Chip from '@mui/joy/Chip';
import {
  Trash2Icon,
  LineChartIcon,
  WaypointsIcon,
  ArchiveIcon,
  LogsIcon,
  FileTextIcon,
  NotebookPenIcon,
  FolderOpenIcon,
  BookmarkIcon,
  MoreVerticalIcon,
  EyeOffIcon,
  EyeIcon,
  LinkIcon,
  BanIcon,
} from 'lucide-react';
import { Typography } from '@mui/joy';
import {
  isDeletableJobRecordStatus,
  isJobStopPending,
  isTerminalJobStatus,
} from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { generateJobPermalink } from '../Jobs/jobDetailUtils';
import JobProgress, { JobCompletionDetails } from './JobProgress';

interface LaunchProgressInfo {
  phase?: string;
  percent?: number;
  message?: string;
}

interface JobsListProps {
  jobs: any[];
  launchProgressByJobId?: Record<string, LaunchProgressInfo>;
  onDeleteJob?: (jobId: string) => void;
  onViewOutput?: (jobId: string) => void;
  onViewCheckpoints?: (jobId: string) => void;
  onViewAllArtifacts?: (jobId: string) => void;
  onViewEvalImages?: (jobId: string) => void;
  onViewSweepOutput?: (jobId: string) => void;
  onViewSweepResults?: (jobId: string) => void;
  onViewEvalResults?: (jobId: string) => void;
  onViewGeneratedDataset?: (jobId: string, datasetId: string) => void;
  onViewInteractive?: (jobId: string) => void;
  onViewFileBrowser?: (jobId: string) => void;
  loading: boolean;
  onViewTrackio?: (jobId: string) => void;
  hideOutputButton?: boolean;
  selectMode?: boolean;
  selectedJobIds?: string[];
  onToggleJobSelected?: (jobId: string) => void;
  onToggleFavorite?: (jobId: string, currentValue: boolean) => void;
  onToggleHidden?: (jobId: string, currentValue: boolean) => void;
  onToggleDiscard?: (jobId: string, currentValue: boolean) => void;
  hideJobId?: boolean;
  showInteractiveType?: boolean;
  showFilesButton?: boolean;
  forceArtifactsButtonVisible?: boolean;
  onStopPendingChange?: (jobId: string, stopPending: boolean) => void;
}

const parseDiscardValue = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 0 || value === 1) {
      return Boolean(value);
    }
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    const numeric = Number.parseInt(normalized, 10);
    if (Number.isNaN(numeric)) {
      return false;
    }
    return numeric === 1;
  }
  return false;
};

const JobsList: React.FC<JobsListProps> = ({
  jobs,
  launchProgressByJobId,
  onDeleteJob,
  onViewOutput,
  onViewCheckpoints,
  onViewAllArtifacts,
  onViewEvalImages,
  onViewSweepOutput,
  onViewSweepResults,
  onViewEvalResults,
  onViewGeneratedDataset,
  onViewInteractive,
  onViewFileBrowser,
  loading,
  onViewTrackio,
  hideOutputButton = false,
  selectMode = false,
  selectedJobIds = [],
  onToggleJobSelected,
  onToggleFavorite,
  onToggleHidden,
  onToggleDiscard,
  hideJobId = false,
  showInteractiveType = false,
  showFilesButton = true,
  forceArtifactsButtonVisible = false,
  onStopPendingChange,
}) => {
  const { experimentInfo } = useExperimentInfo();
  const [descriptionModal, setDescriptionModal] = React.useState<{
    open: boolean;
    jobId: string;
    description: string;
  }>({
    open: false,
    jobId: '',
    description: '',
  });

  const showTrackioForStatus = (status?: string): boolean => {
    return String(status || '') === 'RUNNING' || isTerminalJobStatus(status);
  };

  const formatInteractiveTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      vscode: 'VS Code',
      jupyter: 'Jupyter',
      vllm: 'vLLM',
      ollama: 'Ollama',
      ssh: 'SSH',
      gradio: 'Gradio',
      custom: 'Custom',
    };
    const key = type.toLowerCase();
    if (labels[key]) return labels[key];
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatScoreValue = (value: number): string => {
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1000) return value.toFixed(1);
    if (Math.abs(value) >= 100) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(3);
    return value.toFixed(4);
  };

  const getScoreDisplay = (
    score: unknown,
  ): { label: string; tooltip?: React.ReactNode } | null => {
    if (typeof score === 'number') {
      return { label: `Score: ${formatScoreValue(score)}` };
    }

    if (typeof score === 'string') {
      const parsed = Number.parseFloat(score);
      if (Number.isFinite(parsed)) {
        return { label: `Score: ${formatScoreValue(parsed)}` };
      }
      if (score.trim()) {
        return { label: `Score: ${score.trim()}` };
      }
      return null;
    }

    if (score && typeof score === 'object') {
      const numericEntries = Object.entries(score as Record<string, unknown>)
        .filter(([key]) => key.toLowerCase() !== 'discard')
        .map(([key, val]) => [key, Number(val)] as const)
        .filter(([, val]) => Number.isFinite(val));

      if (numericEntries.length === 0) return null;

      const preferredMetric =
        numericEntries.find(([key]) => key.toLowerCase() === 'score') ??
        numericEntries[0];
      const [firstMetric, firstValue] = preferredMetric;

      const tooltip =
        numericEntries.length > 1 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {numericEntries.map(([metric, val]) => (
              <span key={metric}>
                {metric}: {formatScoreValue(val)}
              </span>
            ))}
          </Box>
        ) : undefined;

      return {
        label: `${firstMetric}: ${formatScoreValue(firstValue)}`,
        tooltip,
      };
    }

    return null;
  };

  const renderDescriptionControl = (job: any) => {
    const descriptionRaw =
      typeof job?.job_data?.description === 'string'
        ? job.job_data.description.trim()
        : '';
    if (!descriptionRaw) return null;

    const descriptionTooltip =
      descriptionRaw.length > 200
        ? `${descriptionRaw.slice(0, 200)}...`
        : descriptionRaw;

    return (
      <Tooltip
        sx={{ maxWidth: 400 }}
        title={descriptionTooltip}
        placement="top"
      >
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={() =>
            setDescriptionModal({
              open: true,
              jobId: String(job?.id ?? ''),
              description: descriptionRaw,
            })
          }
        >
          <NotebookPenIcon size={15} />
        </IconButton>
      </Tooltip>
    );
  };

  const getJobName = (job: any): string => {
    const jobData = job?.job_data || {};

    if (jobData?.parent_sweep_job_id) {
      const runIndex = jobData.sweep_run_index || 0;
      const total = jobData.sweep_total || 0;
      return `Sweep Run ${runIndex}/${total}`;
    }

    if (jobData?.sweep_parent || job?.type === 'SWEEP') {
      const total = jobData.sweep_total || 0;
      return `Sweep: ${total} configurations`;
    }

    if (showInteractiveType) {
      const interactiveType =
        jobData?.interactive_type ||
        job?.interactive_type ||
        jobData?.template_config?.interactive_type;
      if (interactiveType) {
        return formatInteractiveTypeLabel(String(interactiveType));
      }
    }

    return (
      jobData?.cluster_name ||
      jobData?.task_name ||
      jobData?.template_name ||
      job?.type ||
      'Unknown Job'
    );
  };

  const getJobUserEmail = (job: any): string => {
    const userInfo = job?.job_data?.user_info || {};
    return userInfo.email || userInfo.name || '';
  };

  const formatJobConfig = (job: any) => {
    const jobData = job?.job_data || {};

    if (job?.placeholder) {
      return (
        <>
          <Skeleton variant="text" level="body-sm" width={120} />
          <Skeleton variant="text" level="body-sm" width={80} />
        </>
      );
    }

    const sweepParams = jobData?.parent_sweep_job_id
      ? jobData.sweep_params || {}
      : null;
    const sweepParamStr = sweepParams
      ? Object.entries(sweepParams)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : '';

    const sweepConfigStr =
      jobData?.sweep_parent || job?.type === 'SWEEP'
        ? Object.keys(jobData?.sweep_config || {}).join(' × ')
        : '';

    return (
      <>
        {sweepParamStr && (
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {sweepParamStr}
          </Typography>
        )}
        {sweepConfigStr && (
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {sweepConfigStr}
          </Typography>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <Table style={{ tableLayout: 'auto' }} stickyHeader>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <tr key={i}>
              <td>
                <Skeleton variant="text" level="title-sm" />
              </td>
              <td>
                <Skeleton variant="text" level="body-sm" />
              </td>
              <td style={{ textAlign: 'right' }}>
                <Skeleton
                  variant="rectangular"
                  width={200}
                  height={32}
                  sx={{ ml: 'auto' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  return (
    <>
      <Table style={{ tableLayout: 'auto' }} stickyHeader>
        <tbody style={{ overflow: 'auto', height: '100%' }}>
          {jobs?.length > 0 ? (
            jobs?.map((job) => {
              const fullJobId = String(job?.id ?? '');
              const displayJobId =
                String(job?.short_id ?? '').trim() || fullJobId.slice(0, 8);
              const stopPending = isJobStopPending(
                job?.status,
                job?.job_data?.stop_requested,
              );
              const rowOpacityStyle = {
                ...(job?.job_data?.hidden ? { opacity: 0.45 } : {}),
                ...(stopPending
                  ? { opacity: 0.6, pointerEvents: 'none' as const }
                  : {}),
              };
              return (
                <React.Fragment key={job.id}>
                  {!hideJobId && !job?.placeholder && (
                    <tr style={rowOpacityStyle}>
                      <td
                        colSpan={3}
                        style={{
                          border: 'none',
                          paddingBottom: 0,
                          verticalAlign: 'bottom',
                        }}
                      >
                        <Typography
                          level="body-xs"
                          sx={{
                            color: 'text.tertiary',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            pb: 0.25,
                          }}
                          title={fullJobId}
                        >
                          #{displayJobId}
                        </Typography>
                      </td>
                    </tr>
                  )}
                  <tr style={rowOpacityStyle}>
                    <td
                      style={{
                        verticalAlign: 'top',
                        border: 'none',
                        width: 240,
                        minWidth: 140,
                        maxWidth: 220,
                        wordBreak: 'break-word',
                      }}
                    >
                      {selectMode &&
                        job?.job_data?.eval_results &&
                        Array.isArray(job.job_data.eval_results) &&
                        job.job_data.eval_results.length > 0 && (
                          <Checkbox
                            size="sm"
                            checked={selectedJobIds.includes(String(job.id))}
                            onChange={() =>
                              onToggleJobSelected?.(String(job.id))
                            }
                            disabled={stopPending}
                            sx={{ mr: 1 }}
                          />
                        )}
                      {job?.placeholder ? (
                        <>
                          <Skeleton variant="text" level="body-xs" width={70} />
                          <Skeleton
                            variant="text"
                            level="title-sm"
                            width={140}
                          />
                          <Skeleton
                            variant="text"
                            level="body-xs"
                            width={120}
                          />
                        </>
                      ) : (
                        <>
                          <Typography level="title-sm" fontWeight="bold">
                            {getJobName(job)}
                            {job?.job_data?.favorite && (
                              <>
                                {' '}
                                <BookmarkIcon size={16} fill="currentColor" />
                              </>
                            )}
                          </Typography>
                          {getJobUserEmail(job) && (
                            <Typography
                              level="body-xs"
                              sx={{ color: 'text.tertiary' }}
                            >
                              {getJobUserEmail(job)}
                            </Typography>
                          )}
                          {(job?.job_data?.provider_name ||
                            job?.provider_name) && (
                            <Typography
                              level="body-xs"
                              sx={{ color: 'text.tertiary' }}
                            >
                              {job?.job_data?.provider_name ||
                                job?.provider_name}
                            </Typography>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top', border: 'none' }}>
                      <JobProgress
                        job={job}
                        launchProgress={
                          launchProgressByJobId?.[String(job.id)] ??
                          job?.job_data?.launch_progress
                        }
                        onStopPendingChange={onStopPendingChange}
                      />
                      {!job?.placeholder &&
                        (() => {
                          const scoreDisplay = getScoreDisplay(
                            job?.job_data?.score,
                          );
                          const descriptionControl =
                            renderDescriptionControl(job);
                          if (!scoreDisplay && !descriptionControl) return null;
                          return (
                            <Stack
                              direction="row"
                              alignItems="center"
                              gap={0.5}
                              sx={{ mb: 0.5 }}
                            >
                              {descriptionControl}
                              {scoreDisplay && (
                                <Tooltip
                                  title={scoreDisplay.tooltip || ''}
                                  disableHoverListener={!scoreDisplay.tooltip}
                                >
                                  <Chip
                                    size="sm"
                                    color="neutral"
                                    variant="soft"
                                    sx={{ width: 'fit-content' }}
                                  >
                                    {scoreDisplay.label}
                                  </Chip>
                                </Tooltip>
                              )}
                            </Stack>
                          );
                        })()}
                      <JobCompletionDetails job={job} />
                      {formatJobConfig(job)}
                    </td>
                    <td
                      style={{
                        verticalAlign: 'top',
                        width: 'fit-content',
                        border: 'none',
                      }}
                    >
                      <Stack
                        direction="row"
                        gap={0.5}
                        flexWrap="wrap"
                        justifyContent="flex-end"
                      >
                        {job?.placeholder && (
                          <Skeleton
                            variant="rectangular"
                            width={100}
                            height={28}
                          />
                        )}
                        {job?.job_data?.wandb_run_url && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => {
                              window.open(job.job_data.wandb_run_url, '_blank');
                            }}
                            disabled={stopPending}
                            startDecorator={<LineChartIcon />}
                          >
                            W&B Tracking
                          </Button>
                        )}
                        {(job?.job_data?.trackio_db_artifact_path ||
                          job?.job_data?.trackio_project_name) &&
                          showTrackioForStatus(job?.status) && (
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => onViewTrackio?.(String(job?.id))}
                              disabled={stopPending}
                              startDecorator={<LineChartIcon />}
                            >
                              Trackio
                            </Button>
                          )}
                        {!hideOutputButton && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => onViewOutput?.(job?.id)}
                            disabled={stopPending}
                            startDecorator={<LogsIcon />}
                          >
                            Output
                          </Button>
                        )}
                        {job?.job_data?.eval_images_dir && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => onViewEvalImages?.(job?.id)}
                            disabled={stopPending}
                          >
                            View Eval Images
                          </Button>
                        )}
                        {job?.job_data?.eval_results &&
                          Array.isArray(job.job_data.eval_results) &&
                          job.job_data.eval_results.length > 0 && (
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => onViewEvalResults?.(job?.id)}
                              disabled={stopPending}
                              startDecorator={<FileTextIcon />}
                            >
                              Eval Results
                            </Button>
                          )}
                        {(forceArtifactsButtonVisible ||
                          job?.job_data?.artifacts ||
                          job?.job_data?.artifacts_dir ||
                          job?.job_data?.generated_datasets ||
                          job?.job_data?.models ||
                          job?.job_data?.has_profiling) &&
                          !job?.placeholder && (
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() =>
                                onViewAllArtifacts?.(String(job?.id))
                              }
                              disabled={stopPending}
                              startDecorator={<ArchiveIcon />}
                            >
                              Artifacts
                            </Button>
                          )}
                        {(job?.type === 'SWEEP' ||
                          job?.job_data?.sweep_parent) &&
                          job?.status === 'COMPLETE' && (
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => onViewSweepResults?.(job?.id)}
                              disabled={stopPending}
                              startDecorator={<LineChartIcon />}
                            >
                              Sweep Results
                            </Button>
                          )}
                        {job?.job_data?.sweep_output_file && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => onViewSweepOutput?.(job?.id)}
                            disabled={stopPending}
                          >
                            Sweep Output
                          </Button>
                        )}
                        {job?.status === 'INTERACTIVE' &&
                          job?.job_data?.subtype === 'interactive' && (
                            <>
                              <Button
                                size="sm"
                                variant="plain"
                                onClick={() => onViewInteractive?.(job?.id)}
                                disabled={stopPending}
                              >
                                Interactive Setup
                              </Button>
                              {!hideOutputButton && (
                                <Button
                                  size="sm"
                                  variant="plain"
                                  onClick={() => onViewOutput?.(job?.id)}
                                  disabled={stopPending}
                                  startDecorator={<LogsIcon />}
                                >
                                  Output
                                </Button>
                              )}
                            </>
                          )}
                        {job?.job_data?.checkpoints && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => onViewCheckpoints?.(job?.id)}
                            disabled={stopPending}
                            startDecorator={<WaypointsIcon />}
                          >
                            Checkpoints
                          </Button>
                        )}
                        {showFilesButton && !job?.placeholder && (
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => onViewFileBrowser?.(job?.id)}
                            disabled={stopPending}
                            startDecorator={<FolderOpenIcon />}
                          >
                            Files
                          </Button>
                        )}
                        {!job?.placeholder && (
                          <Tooltip title="Copy permalink">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => {
                                const url =
                                  window.location.href.split('#')[0] +
                                  generateJobPermalink(
                                    experimentInfo?.name ?? '',
                                    job.id,
                                  );
                                navigator.clipboard
                                  .writeText(url)
                                  .catch((err) =>
                                    console.error(
                                      'Failed to copy permalink:',
                                      err,
                                    ),
                                  );
                              }}
                            >
                              <LinkIcon size={14} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!job?.placeholder && (
                          <IconButton
                            size="sm"
                            variant="plain"
                            disabled={
                              stopPending ||
                              !isDeletableJobRecordStatus(job?.status)
                            }
                            onClick={() => {
                              if (!isDeletableJobRecordStatus(job?.status)) {
                                return;
                              }
                              onDeleteJob?.(job.id);
                            }}
                          >
                            <Trash2Icon style={{ cursor: 'pointer' }} />
                          </IconButton>
                        )}
                        {!job?.placeholder && (
                          <Dropdown>
                            <MenuButton
                              slots={{ root: IconButton }}
                              slotProps={{
                                root: {
                                  variant: 'plain',
                                  color: 'neutral',
                                  size: 'sm',
                                },
                              }}
                              sx={{ minWidth: 0 }}
                              disabled={stopPending}
                            >
                              <MoreVerticalIcon size={16} />
                            </MenuButton>
                            <Menu>
                              <MenuItem
                                onClick={() =>
                                  onToggleFavorite?.(
                                    String(job.id),
                                    !!job?.job_data?.favorite,
                                  )
                                }
                              >
                                {job?.job_data?.favorite ? (
                                  <>
                                    <BookmarkIcon
                                      size={16}
                                      fill="currentColor"
                                    />{' '}
                                    Unfavorite
                                  </>
                                ) : (
                                  <>
                                    <BookmarkIcon size={16} /> Favorite
                                  </>
                                )}
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  onToggleHidden?.(
                                    String(job.id),
                                    !!job?.job_data?.hidden,
                                  )
                                }
                              >
                                {job?.job_data?.hidden ? (
                                  <>
                                    <EyeIcon size={16} /> Unhide
                                  </>
                                ) : (
                                  <>
                                    <EyeOffIcon size={16} /> Hide
                                  </>
                                )}
                              </MenuItem>
                              <MenuItem
                                onClick={() =>
                                  onToggleDiscard?.(
                                    String(job.id),
                                    parseDiscardValue(
                                      job?.job_data?.score?.discard,
                                    ),
                                  )
                                }
                              >
                                {parseDiscardValue(
                                  job?.job_data?.score?.discard,
                                ) ? (
                                  <>
                                    <BanIcon size={16} /> Unmark discard
                                  </>
                                ) : (
                                  <>
                                    <BanIcon size={16} /> Mark discard
                                  </>
                                )}
                              </MenuItem>
                            </Menu>
                          </Dropdown>
                        )}
                      </Stack>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={3}
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  verticalAlign: 'top',
                  border: 'none',
                }}
              >
                No jobs found
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <Modal
        open={descriptionModal.open}
        onClose={() =>
          setDescriptionModal((prev) => ({
            ...prev,
            open: false,
          }))
        }
      >
        <ModalDialog sx={{ width: 'min(760px, 92vw)', maxHeight: '85vh' }}>
          <ModalClose />
          <Typography level="title-lg">Job Description</Typography>
          {descriptionModal.jobId && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
              Job {descriptionModal.jobId}
            </Typography>
          )}
          <Box
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid',
              borderColor: 'neutral.outlinedBorder',
              borderRadius: 'sm',
              p: 1.5,
              overflowY: 'auto',
            }}
          >
            {descriptionModal.description}
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
};

export default JobsList;
