import React from 'react';
import Table from '@mui/joy/Table';
import Stack from '@mui/joy/Stack';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import Skeleton from '@mui/joy/Skeleton';
import Box from '@mui/joy/Box';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import MenuItem from '@mui/joy/MenuItem';
import Dropdown from '@mui/joy/Dropdown';
import Checkbox from '@mui/joy/Checkbox';
import Tooltip from '@mui/joy/Tooltip';
import {
  Trash2Icon,
  LineChartIcon,
  WaypointsIcon,
  ArchiveIcon,
  LogsIcon,
  FileTextIcon,
  FolderOpenIcon,
  BookmarkIcon,
  MoreVerticalIcon,
  EyeOffIcon,
  EyeIcon,
  LinkIcon,
} from 'lucide-react';
import { Typography } from '@mui/joy';
import {
  isDeletableJobRecordStatus,
  isJobStopPending,
  isTerminalJobStatus,
} from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { generateJobPermalink } from '../Jobs/jobDetailUtils';
import JobProgress from './JobProgress';

export interface LaunchProgressInfo {
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
  hideJobId?: boolean;
  showInteractiveType?: boolean;
  showFilesButton?: boolean;
  forceArtifactsButtonVisible?: boolean;
  onStopPendingChange?: (jobId: string, stopPending: boolean) => void;
}

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
  hideJobId = false,
  showInteractiveType = false,
  showFilesButton = true,
  forceArtifactsButtonVisible = false,
  onStopPendingChange,
}) => {
  const { experimentInfo } = useExperimentInfo();

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

  const formatJobConfig = (job: any) => {
    const jobData = job?.job_data || {};
    const interactiveType =
      jobData?.interactive_type ||
      job?.interactive_type ||
      jobData?.template_config?.interactive_type;

    // Handle sweep child jobs
    if (jobData?.parent_sweep_job_id) {
      const runIndex = jobData.sweep_run_index || 0;
      const total = jobData.sweep_total || 0;
      const sweepParams = jobData.sweep_params || {};
      const paramStr = Object.entries(sweepParams)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return (
        <>
          <b>
            Sweep Run {runIndex}/{total}
          </b>
          {paramStr && (
            <>
              <br />
              <small>{paramStr}</small>
            </>
          )}
        </>
      );
    }

    // Handle sweep parent jobs
    if (jobData?.sweep_parent || job?.type === 'SWEEP') {
      const total = jobData.sweep_total || 0;
      const sweepConfig = jobData.sweep_config || {};
      const configStr = Object.keys(sweepConfig).join(' × ');
      return (
        <>
          <b>Sweep: {total} configurations</b>
          {configStr && (
            <>
              <br />
              <small>{configStr}</small>
            </>
          )}
        </>
      );
    }

    // Prefer showing Cluster Name (if present) and the user identifier (name/email)
    const clusterName = jobData?.cluster_name;

    const userInfo = jobData.user_info || {};
    const userDisplay = userInfo.name || userInfo.email || '';
    const providerDisplay = jobData.provider_name || job?.provider_name || '';

    if (job?.placeholder) {
      return (
        <>
          <Skeleton variant="text" level="body-md" width={160} />
          <Skeleton variant="text" level="body-sm" width={100} />
        </>
      );
    }
    // Interactive jobs: show job type, submitter, provider, and title
    if (showInteractiveType && interactiveType) {
      const taskName = jobData?.task_name || '';
      const typeLabel = formatInteractiveTypeLabel(String(interactiveType));
      return (
        <>
          <Typography level="title-sm" fontWeight="bold">
            {typeLabel}
            {job?.job_data?.favorite && (
              <>
                {' '}
                <BookmarkIcon size={16} fill="currentColor" />
              </>
            )}
          </Typography>
          {userDisplay && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              <b>Submitter:</b> {userDisplay}
            </Typography>
          )}
          {providerDisplay && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              <b>Provider:</b> {providerDisplay}
            </Typography>
          )}
          {taskName && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              <b>Title:</b> {taskName}
            </Typography>
          )}
        </>
      );
    }

    // Build preferred details
    if (clusterName || userDisplay || providerDisplay) {
      return (
        <>
          {clusterName && (
            <Typography level="title-sm" fontWeight="bold">
              {clusterName}{' '}
              {job?.job_data?.favorite && (
                <BookmarkIcon size={16} fill="currentColor" />
              )}
              <br />
            </Typography>
          )}
          {userDisplay && (
            <Typography level="body-sm">
              <b>Submitter:</b> {userDisplay}
            </Typography>
          )}
          {providerDisplay && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              <b>Provider:</b> {providerDisplay}
            </Typography>
          )}
        </>
      );
    }

    // Fallbacks to existing info when no cluster/user available
    if (jobData?.template_name) {
      return (
        <>
          <b>Template:</b> {jobData.template_name}
          <br />
          <b>Type:</b> {job.type || 'Unknown'}
        </>
      );
    }

    return <b>{job.type || 'Unknown Job'}</b>;
  };

  const tableHead = (
    <thead>
      <tr>
        <th>Job ID</th>
        <th>Job Details</th>
        <th>Status</th>
        <th style={{ textAlign: 'right' }}>Logs</th>
      </tr>
    </thead>
  );

  if (loading) {
    return (
      <Table style={{ tableLayout: 'auto' }} stickyHeader>
        {tableHead}
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <tr key={i}>
              <td>
                <Skeleton variant="text" level="title-sm" />
              </td>
              <td>
                <Skeleton variant="text" level="body-sm" />
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
    <Table style={{ tableLayout: 'auto' }} stickyHeader>
      {tableHead}
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
            return (
              <tr
                key={job.id}
                style={{
                  ...(job?.job_data?.hidden ? { opacity: 0.45 } : {}),
                  ...(stopPending
                    ? { opacity: 0.6, pointerEvents: 'none' }
                    : {}),
                }}
              >
                <td style={{ verticalAlign: 'top', border: 'none' }}>
                  {selectMode &&
                    job?.job_data?.eval_results &&
                    Array.isArray(job.job_data.eval_results) &&
                    job.job_data.eval_results.length > 0 && (
                      <Checkbox
                        size="sm"
                        checked={selectedJobIds.includes(String(job.id))}
                        onChange={() => onToggleJobSelected?.(String(job.id))}
                        disabled={stopPending}
                        sx={{ mr: 1 }}
                      />
                    )}
                  {!hideJobId && <b title={fullJobId}>{displayJobId}</b>}
                </td>
                <td style={{ verticalAlign: 'top', border: 'none' }}>
                  {formatJobConfig(job)}
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
                      <Skeleton variant="rectangular" width={100} height={28} />
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
                          onClick={() => onViewAllArtifacts?.(String(job?.id))}
                          disabled={stopPending}
                          startDecorator={<ArchiveIcon />}
                        >
                          Artifacts
                        </Button>
                      )}
                    {(job?.type === 'SWEEP' || job?.job_data?.sweep_parent) &&
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
                      <Tooltip title="Copy permalink" variant="outlined">
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
                                console.error('Failed to copy permalink:', err),
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
                                <BookmarkIcon size={16} fill="currentColor" />{' '}
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
                        </Menu>
                      </Dropdown>
                    )}
                  </Stack>
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td
              colSpan={4}
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
  );
};

export default JobsList;
