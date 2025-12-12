import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import Table from 'ink-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import { api } from '../api';
import { Loading, ErrorMsg, Panel } from '../ui';

dayjs.extend(relativeTime);
dayjs.extend(duration);

export const JobList = () => {
  const { exit } = useApp();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [status, setStatus] = useState('Initializing...');
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setStatus('Fetching experiment list...');
        let experiments = [];
        try {
          const expResponse: any = await api.listExperiments();
          experiments = Array.isArray(expResponse)
            ? expResponse
            : expResponse?.data || [];
        } catch (e: any) {
          setFatalError(`Failed to list experiments: ${e.message}`);
          return;
        }

        const expIds = experiments.map((e: any) => e.id);
        if (!expIds.includes('global')) expIds.push('global');

        setStatus(`Scanning ${expIds.length} contexts for jobs...`);

        const results = await Promise.allSettled(
          expIds.map((id: string) => api.listJobs(id)),
        );

        const successfulJobs: any[] = [];

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const jobData: any = result.value;
            const jobList = Array.isArray(jobData)
              ? jobData
              : jobData?.jobs || [];
            successfulJobs.push(...jobList);
          }
        });

        const uniqueJobs = Array.from(
          new Map(
            successfulJobs.map((item: any) => [item.id || item.job_id, item]),
          ).values(),
        );

        uniqueJobs.sort((a: any, b: any) => {
          const idA = parseInt(a.id || a.job_id || '0', 10);
          const idB = parseInt(b.id || b.job_id || '0', 10);
          return idB - idA;
        });

        setJobs(uniqueJobs);
      } catch (e: any) {
        setFatalError(`Unexpected crash: ${e.message}`);
      } finally {
        exit();
      }
    };
    fetchAll();
  }, [exit]);

  if (fatalError) return <ErrorMsg text="List Failed" detail={fatalError} />;
  if (!jobs) return <Loading text={status} />;

  if (jobs.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text>No jobs found.</Text>
      </Box>
    );
  }

  const tableData = jobs.map((j) => {
    let jobData = j.job_data || {};
    if (typeof jobData === 'string') {
      try {
        jobData = JSON.parse(jobData);
      } catch (e) {
        /* empty */
      }
    }

    const name =
      jobData.task_name ||
      j.task_name ||
      j.config?.name ||
      j.task_id ||
      'Unknown';

    let dur = 'N/A';
    if (j.created_at) {
      const start = dayjs(j.created_at);
      const end = j.ended_at ? dayjs(j.ended_at) : dayjs();

      if (start.isValid()) {
        const diffMs = end.diff(start);
        if (diffMs < 1000 && diffMs >= 0) dur = '< 1s';
        else dur = dayjs.duration(diffMs).humanize();
      }
    }

    return {
      ID: String(j.id || j.job_id),
      Task: name.length > 25 ? `${name.substring(0, 22)}...` : name,
      Status: j.status || 'UNKNOWN',
      Duration: j.status === 'running' ? `Running (${dur})` : dur,
      Exp: j.experiment_id || 'global',
    };
  });

  return (
    <Box flexDirection="column">
      <Table data={tableData} />
      <Box marginTop={1}>
        <Text dimColor>Total: {jobs.length} jobs</Text>
      </Box>
    </Box>
  );
};

export const JobInfo = ({ jobId }: { jobId: string }) => {
  const { exit } = useApp();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getJob(jobId)
      .then((d) => {
        const job: any = (d as any).job || d;
        setData(job);
        exit();
      })
      .catch((e) => {
        setError(api.handleError(e).message);
        exit();
      });
  }, [exit, jobId]);

  if (error) return <ErrorMsg text="Fetch Failed" detail={error} />;
  if (!data) return <Loading text="Fetching info..." />;

  const parse = (val: any) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return {};
      }
    }
    return val || {};
  };

  const config = parse(data.config);
  const jobData = parse(data.job_data);

  const id = data.id || data.job_id || 'Unknown';
  const statusColor =
    (data.status || '').toUpperCase() === 'COMPLETED' ? 'green' : 'yellow';

  // Deep Search for Git Info
  const repo =
    data.repo ||
    data.git_repo_url ||
    jobData.github_repo_url ||
    jobData.repo ||
    config.repo ||
    'N/A';
  const branch =
    data.branch || data.git_branch || jobData.branch || config.branch || 'N/A';
  const sha =
    data.commit || data.git_sha || jobData.commit || config.commit || 'N/A';

  return (
    <Box flexDirection="column">
      <Panel title={`Job: ${id}`} color={statusColor}>
        <Text>
          Status:{' '}
          <Text bold color={statusColor}>
            {data.status}
          </Text>
        </Text>
        <Text>Task: {data.task_name || data.task_id}</Text>

        <Box height={1} />
        <Text bold>Git Context:</Text>
        <Text>Repo: {repo}</Text>
        <Text>Branch: {branch}</Text>
        <Text>SHA: {sha}</Text>

        <Box height={1} />
        <Text bold>Config Dump:</Text>
        <Text dimColor>{JSON.stringify(config, null, 2)}</Text>
      </Panel>
    </Box>
  );
};

export const JobLogs = ({ jobId }: { jobId: string }) => {
  useApp();
  const [logs, setLogs] = useState<string>('');
  const [status, setStatus] = useState('CONNECTING');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: any = null;

    const fetchLogs = async () => {
      try {
        setStatus('FETCHING_INFO');
        const job = await api.getJob(jobId);
        const isFinished = ['STOPPED', 'COMPLETED', 'FAILED'].includes(
          (job as any).status?.toUpperCase(),
        );
        const expId = (job as any).experiment_id || 'global';

        if (isFinished) {
          try {
            setStatus('FETCHING_ARCHIVE');
            const output = await api.getTasksOutput(jobId);
            const content =
              typeof output === 'object'
                ? (output as any).output ||
                  (output as any).logs ||
                  JSON.stringify(output, null, 2)
                : output;

            if (content) {
              setLogs(content);
              setStatus(`ARCHIVED (${(job as any).status})`);

              return;
            }
          } catch (e) {}
        }

        try {
          setStatus('FETCHING_PROVIDER');
          const remoteLogs = await api.getJobLogs(jobId, expId);
          if (remoteLogs) {
            let content: string;
            if (typeof remoteLogs === 'object' && (remoteLogs as any).logs) {
              content = (remoteLogs as any).logs;
            } else if (typeof remoteLogs === 'string') {
              content = remoteLogs;
            } else {
              content = JSON.stringify(remoteLogs);
            }

            if (content) {
              setLogs(content);
              setStatus('REMOTE_SNAPSHOT');
              return;
            }
          }
        } catch (e) {}

        setStatus('STREAMING');
        const response = await api.getJobStream(jobId);
        stream = (response as any).data;

        stream.on('data', (chunk: Buffer) => {
          let text = chunk.toString();

          if (text.startsWith('data: ')) {
            try {
              const jsonStr = text.replace('data: ', '').trim();
              const parsed = JSON.parse(jsonStr);
              if (Array.isArray(parsed) && parsed.length === 0) return;
              text = `${jsonStr}\n`;
            } catch {
              text = text.replace('data: ', '');
            }
          }

          setLogs((prev) => (prev + text).slice(-10000));
        });

        stream.on('end', () =>
          setStatus(
            isFinished ? `FINISHED (${(job as any).status})` : 'STREAM_ENDED',
          ),
        );
        stream.on('error', () => setStatus('STREAM_ERROR'));
      } catch (e: any) {
        setError(api.handleError(e).message);
        setStatus('ERROR');
      }
    };

    fetchLogs();

    return () => {
      if (stream)
        try {
          stream.destroy();
        } catch (e) {}
    };
  }, [jobId]);

  if (error) return <ErrorMsg text="Log Error" detail={error} />;

  return (
    <Box flexDirection="column">
      <Panel title={`Logs: ${jobId} [${status}]`} color="white">
        <Text>
          {logs ||
            (status === 'STREAMING'
              ? 'Waiting for output...'
              : 'No logs found.')}
        </Text>
      </Panel>
      <Text dimColor>Press Ctrl+C to exit.</Text>
    </Box>
  );
};
