import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/joy';
import { CircleCheckIcon, StopCircleIcon, FileTextIcon } from 'lucide-react';
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
import OrchestratorLogsModal from './OrchestratorLogsModal';

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
  };
}

export default function JobProgress({ job }: JobProps) {
  const { experimentInfo } = useExperimentInfo();
  const [orchestratorProgress, setOrchestratorProgress] =
    useState<ProgressState | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);

  const logParserRef = useRef<OrchestratorLogParser | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startLogStreaming = useCallback(async () => {
    if (!job?.job_data?.orchestrator_request_id) return;

    try {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this stream
      abortControllerRef.current = new AbortController();

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.GetLogs(job.job_data?.orchestrator_request_id),
        {
          signal: abortControllerRef.current.signal,
        },
      );

      if (!response.ok) {
        console.error('Failed to start log stream:', response.status);
        return;
      }

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      let buffer = '';
      let shouldStopStream = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done || shouldStopStream) {
          break;
        }

        // Decode the chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages (lines ending with \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete message in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse SSE format: "data: {...}"
          const dataMatch = line.match(/^data: (.+)$/m);
          if (dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1]);

              if (data.log_line && logParserRef.current) {
                // Process the individual log line in real-time
                const progressState = logParserRef.current.processLogLine(
                  data.log_line,
                );
                setOrchestratorProgress(progressState);

                // Check for critical errors that should fail the job
                // Strip ANSI codes first (e.g., \u001b[31m for colors)
                const stripAnsi = (str: string) =>
                  str.replace(/\u001b\[[0-9;]*m/g, '');
                const cleanLogLine = stripAnsi(data.log_line).toLowerCase();

                if (
                  cleanLogLine.includes(
                    'error: failed to provision all possible launchable resources',
                  ) ||
                  (cleanLogLine.includes("error: current 'sky.launch' request") &&
                    cleanLogLine.includes('is cancelled by another process'))
                ) {

                  // Update job status to FAILED
                  if (experimentInfo?.id && job?.id) {

                    try {
                      const response = await chatAPI.authenticatedFetch(
                        chatAPI.Endpoints.Jobs.Update(
                          experimentInfo.id,
                          job.id,
                          'FAILED',
                        ),
                      );
                    } catch (error) {
                      console.error('[API CALL] Failed to update job status:', error);
                    }
                  } else {
                    console.error(
                      '[API CALL] Missing required data:',
                      'experimentInfo.id:',
                      experimentInfo?.id,
                      'job.id:',
                      job?.id,
                    );
                  }

                  // Stop streaming
                  shouldStopStream = true;
                  break;
                }
              }

              if (data.status === 'completed') {
                console.log('Log streaming completed');
                shouldStopStream = true;
                break;
              }

              if (data.error) {
                console.error('Stream error:', data.error);
                shouldStopStream = true;
                break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Log streaming aborted');
      } else {
        console.error('Error streaming orchestrator logs:', error);
      }
    }
  }, [job?.job_data?.orchestrator_request_id]);

  // Initialize log parser for remote jobs
  useEffect(() => {
    if (job?.type === 'REMOTE' && job?.job_data?.orchestrator_request_id) {
      if (!logParserRef.current) {
        logParserRef.current = new OrchestratorLogParser();
      }

      // Start streaming logs only during LAUNCHING state
      // When status changes to RUNNING, the cleanup will abort the stream
      if (job.status === 'LAUNCHING') {
        startLogStreaming();
      }
    }

    return () => {
      // Abort the stream when component unmounts or status changes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    job?.id,
    job?.status,
    job?.type,
    job?.job_data?.orchestrator_request_id,
    startLogStreaming,
  ]);

  // Debug job data
  useEffect(() => {}, [job]);

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
      {job?.status === 'LAUNCHING' ? (
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
            {job?.type === 'REMOTE' &&
              job?.job_data?.orchestrator_request_id && (
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  startDecorator={<FileTextIcon size={16} />}
                  onClick={() => setShowLogsModal(true)}
                >
                  View Logs
                </Button>
              )}
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

      {/* Orchestrator Logs Modal */}
      <OrchestratorLogsModal
        requestId={job?.job_data?.orchestrator_request_id || null}
        open={showLogsModal}
        onClose={() => setShowLogsModal(false)}
      />
    </Stack>
  );
}
