import {
  Box,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/joy';
import Skeleton from '@mui/joy/Skeleton';
import { CircleCheckIcon, StopCircleIcon } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import { jobChipColor } from 'renderer/lib/utils';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import {
  OrchestratorLogParser,
  ProgressState,
} from 'renderer/lib/orchestrator-log-parser';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

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
}

export default function JobProgress({ job }: JobProps) {
  const { experimentInfo } = useExperimentInfo();
  const [orchestratorProgress, setOrchestratorProgress] =
    useState<ProgressState | null>(null);

  const logParserRef = useRef<OrchestratorLogParser | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const startLogPolling = useCallback(async () => {
    if (!job?.job_data?.orchestrator_request_id) return;

    const pollLogs = async () => {
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Jobs.GetLogs(job.job_data?.orchestrator_request_id),
        );

        // If job no longer exists (404) or other error, stop polling
        if (response.status === 404 || !response.ok) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }

        if (response.ok) {
          const responseData = await response.json();
          if (logParserRef.current && responseData.data) {
            const progressState = logParserRef.current.parseLogData(
              responseData.data,
            );
            setOrchestratorProgress(progressState);
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error fetching orchestrator logs:', error);
        // On network or other errors, stop polling to prevent infinite failed requests
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };

    // Poll immediately and then every 2 seconds
    await pollLogs();
    pollingIntervalRef.current = setInterval(
      pollLogs,
      2000,
    ) as unknown as number;
  }, [job?.job_data?.orchestrator_request_id]);

  // Initialize log parser for remote jobs
  useEffect(() => {
    if (job?.type === 'REMOTE' && job?.job_data?.orchestrator_request_id) {
      if (!logParserRef.current) {
        logParserRef.current = new OrchestratorLogParser();
      }

      // Start polling for logs if job is in LAUNCHING or RUNNING state
      if (job.status === 'LAUNCHING' || job.status === 'RUNNING') {
        startLogPolling();
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [
    job?.id,
    job?.status,
    job?.type,
    job?.job_data?.orchestrator_request_id,
    startLogPolling,
  ]);

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
      ) : job?.status === 'LAUNCHING' ? (
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
          </Stack>
          {job?.job_data?.start_time && (
            <>
              Started:{' '}
              {dayjs(job.job_data.start_time).format('MMM D, YYYY HH:mm:ss')}
            </>
          )}
          {/* Show orchestrator progress for REMOTE jobs in LAUNCHING state */}
          {job?.type === 'REMOTE' && orchestratorProgress && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                mt: 1,
                maxWidth: '100%',
              }}
            >
              {[
                {
                  key: 'machineFound',
                  text: 'Machine with Appropriate Resources Found',
                },
                {
                  key: 'ipAllocated',
                  text: 'IP Address Allocated',
                },
                {
                  key: 'provisioningComplete',
                  text: 'Machine Provisioning Complete',
                },
                {
                  key: 'environmentSetup',
                  text: 'Environment Setup Complete',
                },
                {
                  key: 'jobDeployed',
                  text: 'Job Deployed Using Ray',
                },
                {
                  key: 'diskMounted',
                  text: 'Shared Disk Mounted',
                },
                {
                  key: 'sdkInitialized',
                  text: 'Lab SDK Initialized',
                },
              ]
                .filter(
                  ({ key }) => orchestratorProgress[key as keyof ProgressState],
                )
                .map(({ key, text }) => (
                  <Typography
                    key={text}
                    level="body-sm"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      opacity: 1,
                      transition: 'opacity 0.3s ease',
                    }}
                    startDecorator={
                      <CircleCheckIcon size="14px" color="green" />
                    }
                    color="success"
                  >
                    {text}
                  </Typography>
                ))}
            </Box>
          )}
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
            {progress === -1 ? '' : `${progress.toFixed(1)}%`}
            <LinearProgress determinate value={progress} sx={{ my: 1 }} />
            <IconButton
              color="danger"
              onClick={async () => {
                // eslint-disable-next-line no-alert
                if (confirm('Are you sure you want to stop this job?')) {
                  if (job.type === 'REMOTE') {
                    // For REMOTE jobs, use the remote stop endpoint
                    const clusterName = job.job_data?.cluster_name;
                    if (clusterName) {
                      const formData = new FormData();
                      formData.append('job_id', job.id);
                      formData.append('cluster_name', clusterName);
                      await chatAPI.authenticatedFetch(
                        chatAPI.Endpoints.Jobs.StopRemote(),
                        { method: 'POST', body: formData },
                      );
                    } else {
                      // eslint-disable-next-line no-console
                      console.error('No cluster_name found in REMOTE job data');
                    }
                  } else {
                    // For other job types, use the regular stop endpoint
                    await chatAPI.authenticatedFetch(
                      chatAPI.Endpoints.Jobs.Stop(experimentInfo.id, job.id),
                    );
                  }
                }
              }}
            >
              <StopCircleIcon size="20px" />
            </IconButton>
          </Stack>
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
                  Sweep {job.job_data.sweep_current}/{job.job_data.sweep_total}
                </Chip>
                <LinearProgress
                  determinate
                  value={job.job_data.sweep_subprogress}
                  sx={{
                    my: 0.5,
                    height: '4px', // Make it smaller than the main progress bar
                  }}
                />
                {`${Number.parseFloat(job.job_data.sweep_subprogress).toFixed(1)}%`}
              </Stack>
            )}
          {job?.job_data?.start_time && (
            <>
              Started:{' '}
              {dayjs(job.job_data.start_time).format('MMM D, YYYY HH:mm:ss')}
            </>
          )}
          {/* Show default progress for non-REMOTE jobs */}
          {job?.type !== 'REMOTE' && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                columnGap: 1,
                mt: 1,
              }}
            >
              {[
                'Machine with Appropriate Resources Found',
                'IP Address Allocated',
                'Machine Provisioning Complete',
                'Environment Setup Complete',
                'Job Deployed Using Ray',
                'Shared Disk Mounted',
                'Lab SDK Initialized',
              ].map((text) => (
                <Typography
                  key={text}
                  level="body-sm"
                  alignItems="center"
                  display="flex"
                  startDecorator={<CircleCheckIcon size="16px" />}
                  color="primary"
                >
                  {text}
                </Typography>
              ))}
            </Box>
          )}
        </>
      ) : (
        <Stack direction="column" justifyContent="space-between">
          <>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {job.status}
              {progress === -1 ? '' : ` - ${progress.toFixed(1)}%`}
            </Chip>
            {job?.job_data?.start_time && (
              <>
                Started:{' '}
                {dayjs(job?.job_data?.start_time).format(
                  'MMM D, YYYY HH:mm:ss',
                )}{' '}
                <br />
              </>
            )}
            {job?.job_data?.end_time && job?.job_data?.end_time && (
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
            {job?.status === 'COMPLETE' &&
              (job?.job_data?.completion_status ? (
                <>
                  {/* Final Status:{' '} */}
                  {job?.job_data?.completion_status === 'success' ? (
                    <Typography level="body-sm" color="success">
                      Success: {job?.job_data?.completion_details}
                    </Typography>
                  ) : (
                    <Typography level="body-sm" color="danger">
                      Failure: {job?.job_data?.completion_details}
                    </Typography>
                  )}
                </>
              ) : (
                /* If we don't have a status, assume it failed */
                <Typography level="body-sm" color="neutral">
                  No job completion status. Task may have failed. View output
                  for details
                </Typography>
              ))}
          </>
        </Stack>
      )}
    </Stack>
  );
}
