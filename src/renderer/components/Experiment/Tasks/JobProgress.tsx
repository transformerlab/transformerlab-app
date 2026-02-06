import {
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
  Tooltip,
} from '@mui/joy';
import { StopCircleIcon, Info } from 'lucide-react';
import Skeleton from '@mui/joy/Skeleton';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import { jobChipColor } from 'renderer/lib/utils';
import { useCallback } from 'react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface JobData {
  start_time?: string;
  end_time?: string;
  completion_status?: string;
  completion_details?: string;
  [key: string]: any;
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
  showLaunchResultInfo?: boolean;
}

export default function JobProgress({
  job,
  showLaunchResultInfo = false,
}: JobProps) {
  const { experimentInfo } = useExperimentInfo();
  const { fetchWithAuth } = useAuth();

  // Shared stop handler for both LAUNCHING and RUNNING states
  const handleStopJob = useCallback(async () => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to stop this job?')) {
      return;
    }

    if (job.type === 'REMOTE') {
      // For REMOTE jobs, check if they have provider_id (new provider-based jobs)
      const providerId = job.job_data?.provider_id;
      const clusterName = job.job_data?.cluster_name;

      if (providerId && clusterName) {
        // Use the providers stop endpoint
        try {
          const response = await fetchWithAuth(
            chatAPI.Endpoints.ComputeProvider.StopCluster(
              providerId,
              clusterName,
            ),
            { method: 'POST' },
          );
          if (response.ok && experimentInfo?.id && job?.id) {
            // Update job status to STOPPED
            await chatAPI.authenticatedFetch(
              chatAPI.Endpoints.Jobs.Update(
                experimentInfo.id,
                job.id,
                'STOPPED',
              ),
            );
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to stop provider cluster:', error);
        }
      } else {
        // eslint-disable-next-line no-console
        console.error(
          'No cluster_name or provider_id found in REMOTE job data',
        );
      }
    } else if (experimentInfo?.id && job?.id) {
      // For other job types, use the regular stop endpoint
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

  // Format provider launch result for display
  const formatProviderLaunchResult = (launchResult: any): string => {
    if (!launchResult) return '';
    if (typeof launchResult === 'string') return launchResult;
    if (typeof launchResult === 'object') {
      const parts: string[] = [];
      if (launchResult.request_id) {
        parts.push(`Request ID: ${launchResult.request_id}`);
      }
      if (launchResult.cluster_name) {
        parts.push(`Cluster: ${launchResult.cluster_name}`);
      }
      if (launchResult.status) {
        parts.push(`Status: ${launchResult.status}`);
      }
      if (launchResult.message) {
        parts.push(launchResult.message);
      }
      // Include any other relevant fields
      Object.keys(launchResult).forEach((key) => {
        if (
          !['request_id', 'cluster_name', 'status', 'message'].includes(key)
        ) {
          const value = launchResult[key];
          if (value !== null && value !== undefined) {
            parts.push(`${key}: ${String(value)}`);
          }
        }
      });
      return parts.length > 0
        ? parts.join('\n')
        : JSON.stringify(launchResult, null, 2);
    }
    return String(launchResult);
  };

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
      ) : job?.status === 'LAUNCHING' || job?.status === 'INTERACTIVE' ? (
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
            {showLaunchResultInfo &&
              job?.status === 'LAUNCHING' &&
              job?.job_data?.provider_launch_result && (
                <Tooltip
                  title={
                    <Typography
                      level="body-xs"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        maxWidth: 400,
                      }}
                    >
                      {formatProviderLaunchResult(
                        job.job_data.provider_launch_result,
                      )}
                    </Typography>
                  }
                  arrow
                  placement="top"
                  variant="soft"
                  sx={{ maxWidth: 400 }}
                >
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="neutral"
                    sx={{ minHeight: 'unset', p: 0.5 }}
                  >
                    <Info size={16} color="var(--joy-palette-neutral-500)" />
                  </IconButton>
                </Tooltip>
              )}
            <IconButton color="danger" onClick={handleStopJob}>
              <StopCircleIcon size="20px" />
            </IconButton>
          </Stack>
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
      ) : job?.status === 'RUNNING' || job?.status === 'LAUNCHING' ? (
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
            <IconButton color="danger" onClick={handleStopJob}>
              <StopCircleIcon size="20px" />
            </IconButton>
          </Stack>
          {/* For remote provider-backed jobs in LAUNCHING state, show live_status if available */}
          {job?.status === 'LAUNCHING' && job?.job_data?.live_status === 'started' && (
            <Typography level="body-xs" color="neutral">
              Remote command started on compute provider&hellip;
            </Typography>
          )}
          {job?.status === 'LAUNCHING' && job?.job_data?.live_status === 'crashed' && (
            <Typography level="body-xs" color="danger">
              Remote command crashed. Check provider logs for details.
            </Typography>
          )}
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
          </>
        </Stack>
      )}
    </Stack>
  );
}
