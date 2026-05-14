import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Checkbox from '@mui/joy/Checkbox';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import Input from '@mui/joy/Input';
import Stack from '@mui/joy/Stack';
import Tab from '@mui/joy/Tab';
import TabList from '@mui/joy/TabList';
import Tabs from '@mui/joy/Tabs';
import Table from '@mui/joy/Table';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';
import { EyeIcon, SearchIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import Trends, { TrendPoint } from 'renderer/components/Charts/Trends';
import { normalizeJobScore } from 'renderer/lib/jobScore';
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

type PageTab = 'evals' | 'trends';

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

const isJobDiscarded = (job: any): boolean => {
  const score = job?.job_data?.score;
  return !!(score && typeof score === 'object' && (score as any).discard);
};

const getScoreTrendPoints = (jobs: any[]): TrendPoint[] => {
  const scored = jobs
    .map((job) => {
      const normalized = normalizeJobScore(job?.job_data?.score);
      if (!normalized) return null;
      const id = String(job?.id ?? '');
      const shortId =
        String(job?.short_id ?? '').trim() || id.slice(0, 8) || id;
      const rawTime =
        job?.updated_at ?? job?.finished_at ?? job?.created_at ?? null;
      const parsed = rawTime != null ? new Date(rawTime).getTime() : Number.NaN;
      // Reject pre-2000 timestamps (incl. epoch 0 / negative / NaN) so that
      // missing or zeroed-out times don't drag the time axis back to 1970.
      const MIN_VALID_MS = Date.UTC(2000, 0, 1);
      const isValidTime = Number.isFinite(parsed) && parsed >= MIN_VALID_MS;
      return {
        id,
        shortId,
        normalized,
        discarded: isJobDiscarded(job),
        sortKey: isValidTime ? parsed : Number.POSITIVE_INFINITY,
        xTime: isValidTime ? parsed : undefined,
      };
    })
    .filter(
      (
        x,
      ): x is {
        id: string;
        shortId: string;
        normalized: Record<string, number>;
        discarded: boolean;
        sortKey: number;
        xTime: number | undefined;
      } => x !== null,
    )
    .sort((a, b) => a.sortKey - b.sortKey);

  const points: TrendPoint[] = [];
  scored.forEach((job, index) => {
    for (const [metric, value] of Object.entries(job.normalized)) {
      points.push({
        series: metric,
        xIndex: index,
        xTime: job.xTime,
        y: value as number,
        label: job.shortId,
        discarded: job.discarded,
      });
    }
  });
  return points;
};

export default function Evals() {
  const { experimentName = '' } = useParams<{ experimentName: string }>();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const [pageTab, setPageTab] = useState<PageTab>('evals');
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

  const trendPoints = useMemo(() => {
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];
    return getScoreTrendPoints(jobs);
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

  const headerSubtitle =
    pageTab === 'evals'
      ? 'Browse eval-capable jobs in this experiment. Click View to inspect a single result, or select two jobs to compare.'
      : "Score trends across this experiment's jobs.";

  return (
    <Box
      sx={{
        p: 2,
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h3" sx={{ mb: 0.5 }}>
        Evals
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
        {headerSubtitle}
      </Typography>

      <Tabs
        value={pageTab}
        onChange={(_, value) => {
          if (value === 'evals' || value === 'trends') setPageTab(value);
        }}
        sx={{ mb: 2, bgcolor: 'transparent' }}
      >
        <TabList sx={{ width: 'fit-content' }}>
          <Tab value="evals">Evals</Tab>
          <Tab value="trends">Trends</Tab>
        </TabList>
      </Tabs>

      {pageTab === 'evals' ? (
        <>
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
                        <Typography level="body-sm">
                          {job.evalFileCount}
                        </Typography>
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
        </>
      ) : jobsLoading ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'center', py: 6 }}
        >
          <CircularProgress size="sm" />
          <Typography level="body-sm">Loading jobs…</Typography>
        </Stack>
      ) : trendPoints.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            No jobs with scores found for this experiment.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Trends
            points={trendPoints}
            xAxis={{
              initialMode: 'index',
              allowToggle: true,
              indexLabel: 'Run #',
              timeLabel: 'Time',
            }}
            yAxisLabel="Score"
            showTrendlineDefault={false}
          />
        </Box>
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
