import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Checkbox from '@mui/joy/Checkbox';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import Input from '@mui/joy/Input';
import Stack from '@mui/joy/Stack';
import Table from '@mui/joy/Table';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';
import { EyeIcon, SearchIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import CompareEvalResultsModal from './CompareEvalResultsModal';
import ViewEvalResultsModal from './ViewEvalResultsModal';

interface EvalCapableJob {
  id: string;
  shortId: string;
  title: string;
  status: string;
  createdAt: string | null;
  evalFileCount: number;
  provider: string;
}

const COMPARE_LIMIT = 2;

const getEvalCapableJobs = (jobs: any[]): EvalCapableJob[] =>
  jobs.reduce<EvalCapableJob[]>((acc, job) => {
    const evalResults = job?.job_data?.eval_results;
    if (!Array.isArray(evalResults) || evalResults.length === 0) return acc;
    const id = String(job?.id ?? '');
    const shortId = String(job?.short_id ?? '').trim() || id.slice(0, 8);
    const jobData = job?.job_data ?? {};
    const title =
      jobData.task_name ||
      jobData.cluster_name ||
      jobData.template_name ||
      `Job ${shortId}`;
    acc.push({
      id,
      shortId,
      title,
      status: String(job?.status ?? ''),
      createdAt: job?.created_at ?? null,
      evalFileCount: evalResults.length,
      provider: String(jobData.provider_name ?? ''),
    });
    return acc;
  }, []);

function statusColor(
  status: string,
): 'success' | 'primary' | 'danger' | 'warning' | 'neutral' {
  switch (status) {
    case 'COMPLETE':
      return 'success';
    case 'RUNNING':
    case 'LAUNCHING':
    case 'QUEUED':
      return 'primary';
    case 'FAILED':
      return 'danger';
    case 'STOPPED':
    case 'CANCELED':
      return 'warning';
    default:
      return 'neutral';
  }
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString();
}

function formatRelative(iso: string | null, now: number): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export default function Evals() {
  const { experimentName = '' } = useParams<{ experimentName: string }>();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [singleEvalJobId, setSingleEvalJobId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (experimentName) {
      setExperimentId(experimentName);
    }
  }, [experimentName, setExperimentId]);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const { data: jobsRaw, isLoading: jobsLoading } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10000 },
  );

  const evalCapableJobs = useMemo(() => {
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];
    const mapped = getEvalCapableJobs(jobs);
    return mapped.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
  }, [jobsRaw]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return evalCapableJobs;
    return evalCapableJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.shortId.toLowerCase().includes(q) ||
        j.provider.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q),
    );
  }, [evalCapableJobs, search]);

  const toggleSelected = (jobId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(jobId)) return prev.filter((id) => id !== jobId);
      if (prev.length >= COMPARE_LIMIT) return prev;
      return [...prev, jobId];
    });
  };

  const canCompare = selectedIds.length === COMPARE_LIMIT;

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography level="h3" sx={{ mb: 0.5 }}>
        Evals
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
        Browse eval-capable jobs in this experiment. Click View to inspect a
        single result, or select two jobs to compare.
      </Typography>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Input
          startDecorator={<SearchIcon size={16} />}
          placeholder="Search by name, ID, provider, or status"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280, flexGrow: 1, maxWidth: 480 }}
        />
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          {selectedIds.length}/{COMPARE_LIMIT} selected to compare
        </Typography>
        <Button
          variant="solid"
          disabled={!canCompare}
          onClick={() => setCompareOpen(true)}
        >
          Compare selected
        </Button>
        {selectedIds.length > 0 && (
          <Button variant="plain" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        )}
      </Stack>

      {jobsLoading ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'center', py: 6 }}
        >
          <CircularProgress size="sm" />
          <Typography level="body-sm">Loading jobs…</Typography>
        </Stack>
      ) : evalCapableJobs.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            No jobs with eval results yet
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Once a job in this experiment finishes and produces eval result
            files, it will appear here. Head to the Tasks tab to queue an
            evaluation.
          </Typography>
        </Box>
      ) : filteredJobs.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            No jobs match &ldquo;{search}&rdquo;.
          </Typography>
        </Box>
      ) : (
        <Table
          stickyHeader
          hoverRow
          sx={{
            '--TableCell-headBackground':
              'var(--joy-palette-background-level1)',
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Select" />
              <th>Job</th>
              <th style={{ width: 110 }}>Short ID</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 130 }}>Created</th>
              <th style={{ width: 100 }}>Eval files</th>
              <th style={{ width: 110 }} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((job) => {
              const isSelected = selectedIds.includes(job.id);
              const selectDisabled =
                !isSelected && selectedIds.length >= COMPARE_LIMIT;
              const createdAtTooltip =
                now !== null ? formatAbsolute(job.createdAt) : '';
              return (
                <tr key={job.id}>
                  <td>
                    <Checkbox
                      checked={isSelected}
                      disabled={selectDisabled}
                      onChange={() => toggleSelected(job.id)}
                    />
                  </td>
                  <td>
                    <Stack spacing={0.25}>
                      <Typography level="body-sm" fontWeight="md">
                        {job.title}
                      </Typography>
                      {job.provider && (
                        <Typography
                          level="body-xs"
                          sx={{ color: 'text.tertiary' }}
                        >
                          {job.provider}
                        </Typography>
                      )}
                    </Stack>
                  </td>
                  <td>
                    <Typography
                      level="body-xs"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {job.shortId}
                    </Typography>
                  </td>
                  <td>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={statusColor(job.status)}
                    >
                      {job.status || 'unknown'}
                    </Chip>
                  </td>
                  <td>
                    <Tooltip title={createdAtTooltip}>
                      <Typography level="body-sm">
                        {now === null
                          ? '—'
                          : formatRelative(job.createdAt, now)}
                      </Typography>
                    </Tooltip>
                  </td>
                  <td>
                    <Typography level="body-sm">{job.evalFileCount}</Typography>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outlined"
                      startDecorator={<EyeIcon size={14} />}
                      onClick={() => setSingleEvalJobId(job.id)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <CompareEvalResultsModal
        open={compareOpen && canCompare}
        onClose={() => setCompareOpen(false)}
        jobIds={selectedIds}
      />
      <ViewEvalResultsModal
        open={singleEvalJobId !== null}
        onClose={() => setSingleEvalJobId(null)}
        jobId={singleEvalJobId}
      />
    </Box>
  );
}
