import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import Table from 'ink-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import { api } from '../api';
import { Loading, ErrorMsg, Panel } from '../ui';
import SelectInput from 'ink-select-input';
import { GenericList } from './list_commands';

dayjs.extend(relativeTime);
dayjs.extend(duration);

// --- COMPONENTS ---
interface JobListProps {
  experiment?: string;
}

export const JobList = ({ experiment: initialExperiment }: JobListProps) => {
  const [step, setStep] = useState<'LOADING' | 'SELECT' | 'LIST'>('LOADING');
  const [experiments, setExperiments] = useState<any[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<string>(
    initialExperiment || '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If CLI passed an arg, use it.
    if (initialExperiment) {
      setStep('LIST');
      return;
    }

    // Otherwise load experiments for the menu
    let isMounted = true;
    const loadExperiments = async () => {
      try {
        const exps = await api.listExperiments();
        if (isMounted) {
          const list = Array.isArray(exps) ? exps : (exps as any)?.data || [];
          setExperiments(list);
          setStep('SELECT');
        }
      } catch (e: any) {
        if (isMounted) setError(e.message || 'Failed to list experiments');
      }
    };

    loadExperiments();
    return () => {
      isMounted = false;
    };
  }, [initialExperiment]);

  // --- CUSTOM FETCHER FOR 'ALL' MODE ---
  // Since the backend requires an ID and filters strictly,
  // we must fetch all buckets and merge them client-side.
  const fetchAllJobs = async () => {
    try {
      // 1. Get all experiment IDs
      const exps = await api.listExperiments();
      const expList = Array.isArray(exps) ? exps : (exps as any)?.data || [];
      const ids = expList.map((e: any) => e.id);

      // 2. Add 'global' (for unassigned jobs)
      if (!ids.includes('global')) ids.push('global');

      // 3. Fetch all in parallel
      const promises = ids.map((id: string) => api.listJobs(id));
      const results = await Promise.all(promises);

      // 4. Flatten and Sort (Newest first)
      const allJobs = results.flat();
      return allJobs.sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  if (error) return <ErrorMsg text="Error" detail={error} />;
  if (step === 'LOADING') return <Loading text="Fetching experiments..." />;

  if (step === 'SELECT') {
    const items = experiments.map((e: any) => ({
      label: e.name || e.id,
      value: e.id,
    }));

    // Explicitly separate "All" from "Global (Unassigned)"
    items.unshift(
      { label: 'All Jobs (Aggregate)', value: 'ALL' },
      { label: 'Unassigned (Global)', value: 'global' },
    );

    return (
      <Box flexDirection="column">
        <Text bold>Select Scope:</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            setSelectedExperiment(item.value);
            setStep('LIST');
          }}
        />
      </Box>
    );
  }

  // Determine which fetcher to use
  const fetcher =
    selectedExperiment === 'ALL'
      ? fetchAllJobs
      : () => api.listJobs(selectedExperiment);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>
          Viewing:{' '}
          <Text bold color="cyan">
            {selectedExperiment === 'ALL'
              ? 'All Experiments'
              : selectedExperiment}
          </Text>
        </Text>
      </Box>
      <GenericList
        fetcher={fetcher}
        columns={['id', 'status', 'type', 'experiment_id']}
        labelMap={{
          id: 'ID',
          status: 'Status',
          type: 'Type',
          experiment_id: 'Exp ID',
        }}
        noTruncate={['id', 'status']}
      />
    </Box>
  );
};

// Helper for status colors
const getStatusColor = (status: string) => {
  const s = status.toUpperCase();
  if (['COMPLETED', 'SUCCESS', 'FINISHED'].includes(s)) return 'green';
  if (['FAILED', 'ERROR', 'STOPPED'].includes(s)) return 'red';
  if (['RUNNING', 'LAUNCHING', 'PENDING'].includes(s)) return 'yellow';
  return 'white';
};

// Helper to extract repo from the generated setup script if metadata is missing
const extractRepoFromSetup = (setupStr: string) => {
  if (!setupStr) return null;
  // Matches "git clone <url>"
  const match = setupStr.match(/git clone\s+([^\s]+)/);
  return match ? match[1] : null;
};

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
          exit();
        }
      })
      .catch((e) => {
        if (isMounted) setError(api.handleError(e).message);
      });
    return () => {
      isMounted = false;
    };
  }, [jobId, exit]);

  if (error) return <ErrorMsg text="Failed to fetch job" detail={error} />;
  if (!job) return <Loading text={`Fetching info for job ${jobId}...`} />;

  // --- DATA PARSING ---
  const meta = job.job_data || {};
  const config = meta.config || {};

  const statusColor = getStatusColor(job.status);

  // Execution Context
  const taskName = meta.task_name || meta.name || config.name || 'N/A';
  const provider = meta.provider_name || config.provider_name || 'Local';
  const command = meta.command || config.command || 'N/A';

  // --- GIT INFO RESOLUTION ---

  // 1. Try standard fields
  let repo =
    meta.repo ||
    meta.github_repo_url ||
    config.github_repo_url ||
    config.repo ||
    'N/A';

  // 2. Fallback: Parse 'setup' script if repo is still missing
  if (repo === 'N/A' && meta.setup) {
    const extracted = extractRepoFromSetup(meta.setup);
    if (extracted) repo = extracted + ' (Extracted)';
  }

  const branch =
    meta.branch ||
    meta.github_branch ||
    config.github_branch ||
    config.branch ||
    'N/A';

  const commit =
    meta.commit ||
    meta.sha ||
    meta.github_sha ||
    config.commit ||
    config.sha ||
    'N/A';

  const directory =
    meta.git_repo_dir ||
    meta.github_directory ||
    config.github_directory ||
    null;

  // Resources
  const resources = [
    meta.cpus || config.cpus ? `CPUs: ${meta.cpus || config.cpus}` : null,
    meta.memory || config.memory
      ? `Mem: ${meta.memory || config.memory}`
      : null,
    meta.accelerators || config.accelerators
      ? `Accel: ${meta.accelerators || config.accelerators}`
      : null,
    meta.gpu_count || config.gpu_count
      ? `GPUs: ${meta.gpu_count || config.gpu_count}`
      : null,
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
          <Text>
            Repo: <Text color="green">{repo}</Text>
          </Text>
          <Text>
            Branch: <Text color="yellow">{branch}</Text>
          </Text>
          <Text>
            Commit: {commit !== 'N/A' ? commit.substring(0, 8) : 'N/A'}
          </Text>
          {directory && directory !== '.' && <Text>Dir: {directory}</Text>}
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
