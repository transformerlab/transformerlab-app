import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CircularProgress from '@mui/joy/CircularProgress';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Stack from '@mui/joy/Stack';
import Tab from '@mui/joy/Tab';
import TabList from '@mui/joy/TabList';
import Tabs from '@mui/joy/Tabs';
import Typography from '@mui/joy/Typography';
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
}

type PageTab = 'evals' | 'trends';
type EvalMode = 'single' | 'compare';

const getEvalCapableJobs = (jobs: any[]): EvalCapableJob[] =>
  jobs
    .filter((job) => {
      const evalResults = job?.job_data?.eval_results;
      return Array.isArray(evalResults) && evalResults.length > 0;
    })
    .map((job) => {
      const id = String(job?.id ?? '');
      const shortId = String(job?.short_id ?? '').trim() || id.slice(0, 8);
      const title =
        job?.job_data?.task_name ||
        job?.job_data?.cluster_name ||
        job?.job_data?.template_name ||
        `Job ${shortId}`;
      return { id, shortId, title };
    });

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
      const xTime = rawTime != null ? new Date(rawTime).getTime() : Number.NaN;
      return {
        id,
        shortId,
        normalized,
        sortKey: Number.isFinite(xTime) ? xTime : Number.POSITIVE_INFINITY,
        xTime: Number.isFinite(xTime) ? xTime : undefined,
      };
    })
    .filter(
      (
        x,
      ): x is {
        id: string;
        shortId: string;
        normalized: Record<string, number>;
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
      });
    }
  });
  return points;
};

export default function Evals() {
  const { experimentName = '' } = useParams<{ experimentName: string }>();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const [pageTab, setPageTab] = useState<PageTab>('evals');
  const [evalMode, setEvalMode] = useState<EvalMode>('single');
  const [selectedJobA, setSelectedJobA] = useState<string | null>(null);
  const [selectedJobB, setSelectedJobB] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [singleEvalJobId, setSingleEvalJobId] = useState<string | null>(null);

  useEffect(() => {
    if (experimentName) {
      setExperimentId(experimentName);
    }
  }, [experimentName, setExperimentId]);

  const { data: jobsRaw, isLoading: jobsLoading } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10000 },
  );

  const evalCapableJobs = useMemo(() => {
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];
    return getEvalCapableJobs(jobs);
  }, [jobsRaw]);

  const trendPoints = useMemo(() => {
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];
    return getScoreTrendPoints(jobs);
  }, [jobsRaw]);

  const compareDisabled =
    !selectedJobA || !selectedJobB || selectedJobA === selectedJobB;
  const canViewSingleEval = Boolean(selectedJobA);

  const headerSubtitle =
    pageTab === 'evals'
      ? "Pick a mode, then either view one job's evals or compare two jobs."
      : "Score trends across this experiment's jobs.";

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography level="h3" sx={{ mb: 1 }}>
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

      <Card variant="soft" sx={{ maxWidth: pageTab === 'trends' ? 1100 : 720 }}>
        {jobsLoading ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'center', py: 3 }}
          >
            <CircularProgress size="sm" />
            <Typography level="body-sm">Loading jobs...</Typography>
          </Stack>
        ) : pageTab === 'evals' ? (
          evalCapableJobs.length === 0 ? (
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              No jobs with eval results found for this experiment.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Tabs
                value={evalMode}
                onChange={(_, value) => {
                  if (value === 'single' || value === 'compare') {
                    setEvalMode(value);
                  }
                }}
              >
                <TabList variant="soft" sx={{ width: 'fit-content' }}>
                  <Tab value="single">View single eval</Tab>
                  <Tab value="compare">Compare evals</Tab>
                </TabList>
              </Tabs>

              {evalMode === 'single' && (
                <>
                  <FormControl>
                    <FormLabel>Job</FormLabel>
                    <Select
                      value={selectedJobA}
                      onChange={(_, value) => setSelectedJobA(value)}
                    >
                      {evalCapableJobs.map((job) => (
                        <Option key={`single-${job.id}`} value={job.id}>
                          {job.title} ({job.shortId})
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button
                      onClick={() => {
                        if (selectedJobA) {
                          setSingleEvalJobId(selectedJobA);
                        }
                      }}
                      disabled={!canViewSingleEval}
                    >
                      View evals
                    </Button>
                  </Stack>
                </>
              )}

              {evalMode === 'compare' && (
                <>
                  <FormControl>
                    <FormLabel>Job A</FormLabel>
                    <Select
                      value={selectedJobA}
                      onChange={(_, value) => setSelectedJobA(value)}
                    >
                      {evalCapableJobs.map((job) => (
                        <Option key={`job-a-${job.id}`} value={job.id}>
                          {job.title} ({job.shortId})
                        </Option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Job B</FormLabel>
                    <Select
                      value={selectedJobB}
                      onChange={(_, value) => setSelectedJobB(value)}
                    >
                      {evalCapableJobs.map((job) => (
                        <Option key={`job-b-${job.id}`} value={job.id}>
                          {job.title} ({job.shortId})
                        </Option>
                      ))}
                    </Select>
                  </FormControl>

                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button
                      onClick={() => setCompareOpen(true)}
                      disabled={compareDisabled}
                    >
                      Compare evals
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          )
        ) : trendPoints.length === 0 ? (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No jobs with scores found for this experiment.
          </Typography>
        ) : (
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
        )}
      </Card>

      <CompareEvalResultsModal
        open={
          compareOpen &&
          Boolean(selectedJobA) &&
          Boolean(selectedJobB) &&
          selectedJobA !== selectedJobB
        }
        onClose={() => setCompareOpen(false)}
        jobIds={
          selectedJobA && selectedJobB ? [selectedJobA, selectedJobB] : []
        }
      />
      <ViewEvalResultsModal
        open={singleEvalJobId !== null}
        onClose={() => setSingleEvalJobId(null)}
        jobId={singleEvalJobId}
      />
    </Box>
  );
}
