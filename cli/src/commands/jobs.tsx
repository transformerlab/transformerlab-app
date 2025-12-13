import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import Table from 'ink-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import { api } from '../api';
import { Loading, ErrorMsg, Panel } from '../ui';
import { GenericList } from './list_commands';

dayjs.extend(relativeTime);
dayjs.extend(duration);

const getStatusColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'RUNNING':
      return 'green';
    case 'COMPLETED':
      return 'green';
    case 'SUCCESS':
      return 'green';
    case 'FAILED':
      return 'red';
    case 'ERROR':
      return 'red';
    case 'QUEUED':
      return 'yellow';
    case 'LAUNCHING':
      return 'cyan';
    case 'STOPPED':
      return 'red';
    default:
      return 'white';
  }
};

// --- COMPONENTS ---

export const JobList = () => (
  <GenericList
    fetcher={() => api.listJobs()}
    columns={['id', 'status', 'type', 'experiment_id']}
    labelMap={{
      id: 'ID',
      status: 'Status',
      type: 'Type',
      experiment_id: 'Experiment',
    }}
    noTruncate={['id', 'status']}
  />
);

export const JobInfo = ({ jobId }: { jobId: string }) => {
  const { exit } = useApp();
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    api
      .getJob(jobId)
      .then((data) => {
        if (isMounted) {
          setJob(data);
          exit(); // We exit ink's rendering loop but keep the output
        }
      })
      .catch((e) => {
        if (isMounted) setError(api.handleError(e).message);
      });
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  if (error) return <ErrorMsg text="Failed to fetch job" detail={error} />;
  if (!job) return <Loading text={`Fetching info for job ${jobId}...`} />;

  // Parse Data based on Python Job Class structure
  const meta = job.job_data || {};
  const statusColor = getStatusColor(job.status);

  // Extract specific fields commonly used in Remote/Local jobs
  const taskName = meta.task_name || meta.name || 'N/A';
  const provider = meta.provider_name || 'Local';
  const command = meta.command || 'N/A';

  // Git Info (often nested in job_data for remote jobs)
  const repo = meta.github_repo_url || meta.repo || 'N/A';
  const branch = meta.github_branch || meta.branch || 'N/A';
  const commit = meta.github_sha || meta.commit || 'N/A';

  // Resources
  const resources = [
    meta.cpus ? `CPUs: ${meta.cpus}` : null,
    meta.memory ? `Mem: ${meta.memory}` : null,
    meta.accelerators ? `Accel: ${meta.accelerators}` : null,
    meta.gpu_count ? `GPUs: ${meta.gpu_count}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <Box flexDirection="column">
      {/* Header Panel */}
      <Box
        borderStyle="round"
        borderColor={statusColor}
        flexDirection="column"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold>
            Job ID: <Text color="white">{job.id}</Text>
          </Text>
          <Text bold color={statusColor}>
            {job.status}
          </Text>
        </Box>
        <Box justifyContent="space-between">
          <Text>Type: {job.type}</Text>
          <Text>Exp: {job.experiment_id || 'Global'}</Text>
        </Box>
        {job.progress > 0 && <Text>Progress: {job.progress}%</Text>}
      </Box>

      {/* Details Panel */}
      <Box flexDirection="column" marginTop={1}>
        <Panel title="Execution Context" color="blue">
          <Text>
            Task Name: <Text bold>{taskName}</Text>
          </Text>
          <Text>Provider: {provider}</Text>
          {resources && <Text>Resources: {resources}</Text>}
          <Box marginTop={1}>
            <Text bold>Command:</Text>
            <Text dimColor>{command}</Text>
          </Box>
        </Panel>

        <Panel title="Source Context" color="magenta">
          <Text>Repo: {repo}</Text>
          <Text>Branch: {branch}</Text>
          <Text>Commit: {commit.substring(0, 8)}</Text>
        </Panel>

        {meta.error_msg && (
          <Panel title="Error Message" color="red">
            <Text color="red">{meta.error_msg}</Text>
          </Panel>
        )}
      </Box>

      {/* Footer Hints */}
      <Box marginTop={1}>
        <Text dimColor>
          View logs:{' '}
          <Text bold color="white">
            lab job logs {job.id}
          </Text>
        </Text>
      </Box>
      <Text dimColor>
        Stop job:{' '}
        <Text bold color="white">
          lab job stop {job.id}
        </Text>
      </Text>
    </Box>
  );
};

export const JobLogs = ({ jobId }: { jobId: string }) => {
  const { exit } = useApp();
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getJobLogs(jobId)
      .then((data: any) => {
        // Handle different log response formats
        if (typeof data === 'string') setLogs(data);
        else if (data.logs) setLogs(data.logs);
        else if (data.content) setLogs(data.content);
        else setLogs(JSON.stringify(data, null, 2));
        setLoading(false);
        exit();
      })
      .catch((e) => {
        setError(api.handleError(e).message);
        setLoading(false);
      });
  }, [jobId]);

  if (error) return <ErrorMsg text="Log Fetch Failed" detail={error} />;
  if (loading) return <Loading text={`Fetching logs for ${jobId}...`} />;

  return (
    <Box flexDirection="column">
      <Panel title={`Logs: ${jobId}`} color="gray">
        <Text>{logs || 'No logs found.'}</Text>
      </Panel>
    </Box>
  );
};
