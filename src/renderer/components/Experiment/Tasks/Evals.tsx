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
import CompareEvalResultsModal from './CompareEvalResultsModal';
import ViewEvalResultsModal from './ViewEvalResultsModal';

interface EvalCapableJob {
  id: string;
  shortId: string;
  title: string;
}

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

export default function Evals() {
  const { experimentName = '' } = useParams<{ experimentName: string }>();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const [mode, setMode] = useState<EvalMode>('single');
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

  const compareDisabled =
    !selectedJobA || !selectedJobB || selectedJobA === selectedJobB;
  const canViewSingleEval = Boolean(selectedJobA);

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography level="h3" sx={{ mb: 1 }}>
        Evals
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
        Pick a mode, then either view one job's evals or compare two jobs.
      </Typography>

      <Card variant="soft" sx={{ maxWidth: 720 }}>
        {jobsLoading ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'center', py: 3 }}
          >
            <CircularProgress size="sm" />
            <Typography level="body-sm">Loading jobs...</Typography>
          </Stack>
        ) : evalCapableJobs.length === 0 ? (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            No jobs with eval results found for this experiment.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Tabs
              value={mode}
              onChange={(_, value) => {
                if (value === 'single' || value === 'compare') {
                  setMode(value);
                }
              }}
            >
              <TabList variant="soft" sx={{ width: 'fit-content' }}>
                <Tab value="single">View single eval</Tab>
                <Tab value="compare">Compare evals</Tab>
              </TabList>
            </Tabs>

            {mode === 'single' ? (
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
            ) : (
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
