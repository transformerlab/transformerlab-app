import { Chip, IconButton, LinearProgress, Stack, Typography } from '@mui/joy';
import { StopCircleIcon } from 'lucide-react';
import Skeleton from '@mui/joy/Skeleton';
import CircularProgress from '@mui/joy/CircularProgress';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import utc from 'dayjs/plugin/utc';
import { jobChipColor } from 'renderer/lib/utils';
import { useCallback } from 'react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(utc);

interface JobData {
  start_time?: string;
  end_time?: string;
  completion_status?: string;
  completion_details?: string;
  [key: string]: any;
}

interface LaunchProgressInfo {
  phase?: string;
  percent?: number;
  message?: string;
}

interface JobProps {
  job: {
    id: string;
    type?: string;
    status: string;
    progress: string | number;
    job_data?: JobData;
    placeholder?: boolean;
  };
  launchProgress?: LaunchProgressInfo | null;
  hideCircularLaunchProgressAtOrAbove?: number;
}

export default function JobProgress({
  job,
  launchProgress,
  hideCircularLaunchProgressAtOrAbove,
}: JobProps) {
  const { experimentInfo } = useExperimentInfo();
  const { fetchWithAuth } = useAuth();
  const stopping = job?.status === 'STOPPING';
  const effectiveLaunchProgress =
    job?.status === 'INTERACTIVE'
      ? null
      : (launchProgress ?? job?.job_data?.launch_progress ?? null);

  // Shared stop handler for both LAUNCHING and RUNNING states
  const handleStopJob = useCallback(async () => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to stop this job?')) {
      return;
    }

    // Check if job has provider metadata (works for both remote and local providers)
    const providerId = job.job_data?.provider_id;
    const clusterName = job.job_data?.cluster_name;

    if (providerId && clusterName) {
      try {
        // Let the backend handle STOPPING status transition
        if (experimentInfo?.id && job?.id) {
          await chatAPI.authenticatedFetch(
            chatAPI.Endpoints.Jobs.Stop(experimentInfo.id, job.id),
          );
        }
        await fetchWithAuth(
          chatAPI.Endpoints.ComputeProvider.StopCluster(
            providerId,
            clusterName,
          ),
          { method: 'POST' },
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to stop provider cluster:', error);
        // Roll back from STOPPING so the user can retry
        if (experimentInfo?.id && job?.id) {
          await chatAPI.authenticatedFetch(
            chatAPI.Endpoints.Jobs.Update(experimentInfo.id, job.id, 'RUNNING'),
          );
        }
      }
    } else if (experimentInfo?.id && job?.id) {
      // For jobs without provider metadata, use the regular stop endpoint
      await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.Stop(experimentInfo.id, job.id),
      );
    }
  }, [job, experimentInfo?.id, fetchWithAuth]);

  // Ensure progress is a number
  const progress = (() => {
    if (typeof job?.progress === 'string') {
      return parseFloat(job.progress);
    }
    if (typeof job?.progress === 'number') {
      return job.progress;
    }
    return 0;
  })();

  const renderLiveStatusSubtitle = () => {
    const liveStatus = job?.job_data?.live_status;
    if (!liveStatus) return null;

    const isCrashed = liveStatus.toLowerCase().includes('crashed');

    return (
      <Typography level="body-xs" color={isCrashed ? 'danger' : 'neutral'}>
        {liveStatus}
      </Typography>
    );
  };

  const clampedLaunchPercent =
    effectiveLaunchProgress?.percent == null
      ? null
      : Math.min(100, Math.max(0, effectiveLaunchProgress.percent));
  const showCircularLaunchProgress =
    clampedLaunchPercent != null &&
    (hideCircularLaunchProgressAtOrAbove == null ||
      clampedLaunchPercent < hideCircularLaunchProgressAtOrAbove);

  /* eslint-disable no-nested-ternary */
  return (
    <Stack>
      {job?.placeholder ? (
        <>
          <Stack direction="row" alignItems="center" gap={1}>
            <Chip>
              <Skeleton variant="text" level="body-xs" width={60} />
            </Chip>
          </Stack>
          <Skeleton variant="text" level="body-sm" width={180} />
          <Skeleton
            variant="rectangular"
            width={220}
            height={10}
            sx={{ my: 0.5 }}
          />
        </>
      ) : job?.status === 'STOPPING' ? (
        <>
          <Stack direction="row" alignItems="center" gap={1}>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              STOPPING
            </Chip>
            <CircularProgress size="sm" thickness={2} />
            <Typography level="body-xs" color="warning">
              Shutting down&hellip;
            </Typography>
          </Stack>
        </>
      ) : job?.status === 'LAUNCHING' ||
        job?.status === 'INTERACTIVE' ||
        job?.status === 'WAITING' ? (
        <>
          <Stack direction="row" alignItems="center" gap={1}>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {job.status}
            </Chip>
            {showCircularLaunchProgress && (
              <Stack
                direction="row"
                alignItems="center"
                gap={0.5}
                sx={{ flexShrink: 0 }}
              >
                <CircularProgress
                  determinate
                  value={clampedLaunchPercent}
                  size="sm"
                  thickness={3}
                />
                <Typography level="body-xs" fontWeight="md">
                  {Math.round(clampedLaunchPercent)}%
                </Typography>
              </Stack>
            )}
            <IconButton
              color="danger"
              onClick={handleStopJob}
              disabled={stopping}
            >
              {stopping ? (
                <CircularProgress size="sm" thickness={2} />
              ) : (
                <StopCircleIcon size="20px" />
              )}
            </IconButton>
            {stopping && (
              <Typography level="body-xs" color="warning">
                Stopping&hellip;
              </Typography>
            )}
          </Stack>
          {(effectiveLaunchProgress?.message ||
            effectiveLaunchProgress?.percent != null) && (
            <Stack
              direction="column"
              sx={{ width: '100%', mt: 0.5 }}
              spacing={0.5}
            >
              {effectiveLaunchProgress?.message && (
                <Typography level="body-sm" textColor="neutral.600">
                  {effectiveLaunchProgress.message}
                </Typography>
              )}
              {effectiveLaunchProgress?.percent != null && (
                <LinearProgress
                  determinate
                  value={Math.min(
                    100,
                    Math.max(0, effectiveLaunchProgress.percent),
                  )}
                  sx={{ maxWidth: 240, height: 6, borderRadius: 'sm' }}
                />
              )}
            </Stack>
          )}
          {job?.job_data?.start_time && (
            <>
              Started:{' '}
              {dayjs
                .utc(job.job_data.start_time)
                .local()
                .format('MMM D, YYYY HH:mm:ss')}
            </>
          )}
          {renderLiveStatusSubtitle()}
        </>
      ) : job?.status === 'RUNNING' ? (
        <>
          <Stack direction="row" alignItems="center" gap={1}>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {job.status}
            </Chip>
            {/* For sweep parent jobs, show sweep progress instead of regular progress */}
            {(job?.job_data?.sweep_parent || job?.type === 'SWEEP') &&
            job?.job_data?.sweep_total ? (
              <>
                Sweep {job.job_data.sweep_completed || 0}/
                {job.job_data.sweep_total} complete
                {job.job_data.sweep_running
                  ? ` (${job.job_data.sweep_running} running)`
                  : ''}
                {job.job_data.sweep_failed
                  ? ` (${job.job_data.sweep_failed} failed)`
                  : ''}
              </>
            ) : progress === -1 ? (
              ''
            ) : (
              `${progress.toFixed(1)}%`
            )}
            <LinearProgress
              determinate
              value={
                job?.job_data?.sweep_parent || job?.type === 'SWEEP'
                  ? job?.job_data?.sweep_progress || 0
                  : progress
              }
              sx={{ my: 1 }}
            />
            <IconButton
              color="danger"
              onClick={handleStopJob}
              disabled={stopping}
            >
              {stopping ? (
                <CircularProgress size="sm" thickness={2} />
              ) : (
                <StopCircleIcon size="20px" />
              )}
            </IconButton>
            {stopping && (
              <Typography level="body-xs" color="warning">
                Stopping&hellip;
              </Typography>
            )}
          </Stack>
          {renderLiveStatusSubtitle()}
          {/* Add smaller sweep subprogress bar when job.progress is -1 */}
          {job.progress === '-1' &&
            Object.prototype.hasOwnProperty.call(
              job?.job_data,
              'sweep_subprogress',
            ) && (
              <Stack
                direction="row"
                alignItems="center"
                gap={1}
                sx={{ mt: 0.5 }}
              >
                <Chip
                  size="sm"
                  variant="soft"
                  color="primary"
                  sx={{
                    fontSize: 'var(--joy-fontSize-xs)',
                    height: 'auto',
                    py: 0.5,
                  }}
                >
                  Sweep {job.job_data?.sweep_current}/
                  {job.job_data?.sweep_total}
                </Chip>
                <LinearProgress
                  determinate
                  value={job.job_data?.sweep_subprogress || 0}
                  sx={{
                    my: 0.5,
                    height: '4px', // Make it smaller than the main progress bar
                  }}
                />
                {`${Number.parseFloat(String(job.job_data?.sweep_subprogress || 0)).toFixed(1)}%`}
              </Stack>
            )}
          {job?.job_data?.start_time && (
            <>
              Started:{' '}
              {dayjs
                .utc(job.job_data.start_time)
                .local()
                .format('MMM D, YYYY HH:mm:ss')}
            </>
          )}
        </>
      ) : (
        <Stack direction="column" justifyContent="space-between">
          <Chip
            sx={{
              backgroundColor: jobChipColor(job.status),
              color: 'var(--joy-palette-neutral-800)',
            }}
          >
            {job.status}
            {progress === -1 ? '' : ` - ${progress.toFixed(1)}%`}
          </Chip>
          <>
            {job?.job_data?.start_time && (
              <>
                Started:{' '}
                {dayjs
                  .utc(job?.job_data?.start_time)
                  .local()
                  .format('MMM D, YYYY HH:mm:ss')}{' '}
                <br />
              </>
            )}
            {job?.job_data?.end_time && job?.job_data?.start_time && (
              <>
                Completed in:{' '}
                {dayjs
                  .duration(
                    dayjs(job?.job_data?.end_time).diff(
                      dayjs(job?.job_data?.start_time),
                    ),
                  )
                  .humanize()}{' '}
                <br />
              </>
            )}
            {/* eslint-disable-next-line no-nested-ternary, prettier/prettier */}
            {job?.status === 'COMPLETE' &&
              (job?.job_data?.completion_status ? (
                job?.job_data?.completion_status === 'success' ? (
                  <Typography level="body-sm" color="success">
                    Success: {job?.job_data?.completion_details}
                  </Typography>
                ) : (
                  <Typography level="body-sm" color="danger">
                    Failure: {job?.job_data?.completion_details}
                  </Typography>
                )
              ) : (
                /* If we don't have a status, assume it failed */
                <Typography level="body-sm" color="neutral" />
              ))}
            {job?.status === 'FAILED' && job?.job_data?.error_msg && (
              <Typography
                level="body-sm"
                color="danger"
                sx={{
                  maxWidth: 400,
                  maxHeight: 80,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                Error: {job.job_data.error_msg}
              </Typography>
            )}
          </>
        </Stack>
      )}
    </Stack>
  );
}
