import {
  Box,
  Button,
  IconButton,
  ButtonGroup,
  Chip,
  Sheet,
  Table,
  Typography,
  Link,
  Checkbox,
} from '@mui/joy';
import {
  ChartColumnBigIcon,
  ChartColumnIncreasingIcon,
  FileDigitIcon,
  Grid3X3Icon,
  Trash2Icon,
  LineChartIcon,
  Type,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import TensorboardModal from '../Train/TensorboardModal';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewCSVModal from './ViewCSVModal';
import ViewPlotModal from './ViewPlotModal';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { jobChipColor } from 'renderer/lib/utils';
import JobProgress from '../Train/JobProgress';
dayjs.extend(relativeTime);
var duration = require('dayjs/plugin/duration');
dayjs.extend(duration);

var utc = require('dayjs/plugin/utc');
var timezone = require('dayjs/plugin/timezone'); // dependent on utc plugin
dayjs.extend(utc);
dayjs.extend(timezone);

const fetcher = (url) => fetch(url).then((res) => res.json());

function getLocalTimeSinceEvent(utcTimestamp) {
  // Parse the UTC timestamp
  const eventTime = dayjs.utc(utcTimestamp);
  // Convert to local timezone
  const localEventTime = eventTime.local();
  // Get current local time
  const currentTime = dayjs();
  // Calculate the time difference
  return localEventTime.from(currentTime);
}

function RenderScore({ score }) {
  if (score === undefined) {
    return <Chip color="warning">Not available</Chip>;
  }
  if (score === null) {
    return <Chip color="danger">Failed</Chip>;
  }

  let scoreArray = [];
  try {
    scoreArray = JSON.parse(score);
  } catch {
    return <Chip color="danger">Failed</Chip>;
  }

  // if scoreArray is not an array, return the score as a string
  if (!Array.isArray(scoreArray)) {
    return JSON.stringify(scoreArray);
  }

  return scoreArray.map((score, idx) => (
    <>
      <Chip
        key={idx}
        color="success"
        variant="outlined"
        sx={{ marginRight: '4px' }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <ChartColumnBigIcon size="14px" style={{ marginRight: '3px' }} />{' '}
          {score?.type}: {score?.score.toFixed(5)}
        </span>
      </Chip>
      <br />
    </>
  ));
}

function transformMetrics(
  data: Array<{
    test_case_id: string;
    metric_name: string;
    score: number;
    evaluator_name: string;
    job_id: string;
    [key: string]: any;
  }>,
  type: 'summary' | 'detailed' = 'summary'
) {
  if (type === 'summary') {
    const grouped: {
      [key: string]: {
        evaluator_name: string;
        job_id: string;
        type: string;
        sum: number;
        count: number;
      };
    } = {};

    data.forEach((entry) => {
      // Extract only the fields we care about.
      let { metric_name, score, evaluator_name, job_id } = entry;
      if (!metric_name || score === undefined || score === null || !evaluator_name || !job_id) {
        return;
      }

      // Use a combined key to group only entries that share evaluator_name, job_id AND metric_name.
      const key = `${evaluator_name}|${job_id}|${metric_name}`;
      if (grouped[key]) {
        grouped[key].sum += score;
        grouped[key].count += 1;
      } else {
        grouped[key] = {
          evaluator_name,
          job_id,
          type: metric_name,
          sum: score,
          count: 1,
        };
      }
    });

    // Generate deduplicated list with averaged scores rounded to 5 decimals.
    return Object.values(grouped).map((item) => ({
      evaluator: item.evaluator_name,
      job_id: item.job_id,
      type: item.type,
      score: Number((item.sum / item.count).toFixed(5)),
    }));
  } else if (type === 'detailed') {
    // For detailed output we are not averaging.
    // Expected header sequence: test_case_id, metric_name, job_id, evaluator_name, metric_name, score, ...extra
    // Determine extra keys from the entry (excluding core ones).
    const extraKeysSet = new Set<string>();
    data.forEach((entry) => {
      Object.keys(entry).forEach((k) => {
        if (!['test_case_id', 'metric_name', 'job_id', 'evaluator_name', 'score'].includes(k)) {
          extraKeysSet.add(k);
        }
      });
    });
    const extraKeys = Array.from(extraKeysSet).sort();

    const header = ['test_case_id', 'metric_name', 'job_id', 'evaluator_name', 'metric_name', 'score', ...extraKeys];

    const body = data.map((entry) => {
      const extraValues = extraKeys.map((key) => entry[key]);
      return [
        entry.test_case_id, // using test_case_id instead of job_id
        entry.metric_name,
        entry.job_id,
        entry.evaluator_name,
        entry.metric_name,
        entry.score,
        ...extraValues,
      ];
    });

    return { header, body };
  }
}


const EvalJobsTable = () => {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [openCSVModal, setOpenCSVModal] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [openPlotModal, setOpenPlotModal] = useState(false);
  const [currentJobId, setCurrentJobId] = useState('');
  const [currentData, setCurrentData] = useState('');
  const [compareChart, setCompareChart] = useState(false);
  const [currentTensorboardForModal, setCurrentTensorboardForModal] = useState(-1);
  const [fileNameForDetailedReport, setFileNameForDetailedReport] = useState('');

  const fetchCSV = async (jobId) => {
    const response = await fetch(
      chatAPI.Endpoints.Experiment.GetAdditionalDetails(jobId)
    );
    const text = await response.text();
    return text;
  };

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(chatAPI.Endpoints.Jobs.GetJobsOfType('EVAL', ''), fetcher, {
    refreshInterval: 2000,
    fallbackData: [],
  });

  const handleCombinedReports = async (comparisonType: 'summary' | 'detailed' = 'summary') => {
    try {
      const jobIdsParam = selected.join(',');
      const compareEvalsUrl = chatAPI.Endpoints.Charts.CompareEvals(jobIdsParam);
      const response = await fetch(compareEvalsUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      if (comparisonType === 'summary') {
        const transformedData = transformMetrics(JSON.parse(data), "summary");

        setCurrentData(JSON.stringify(transformedData));
        setOpenPlotModal(true);
        setCompareChart(true);
        setCurrentJobId('-1');
      } else if (comparisonType === 'detailed') {
          const transformedData = transformMetrics(JSON.parse(data), "detailed");

          setCompareData(transformedData);
          handleOpenCSVModal('-1');

      }
    } catch (error) {
      console.error('Failed to fetch combined reports:', error);
    }
  };


  const handleOpenCSVModal = (jobId) => {
    setCurrentJobId(jobId);
    setOpenCSVModal(true);

  };

  const handleOpenPlotModal = (jobId, score) => {
    setCurrentData(score);
    setOpenPlotModal(true);
    setCompareChart(false);
    setCurrentJobId(jobId);
  };

  useEffect(() => {
    // Component did mount logic here
  }, []);

  return (
    <>
      <ViewCSVModal
        open={openCSVModal}
        onClose={() => {
          setOpenCSVModal(false)
          setCompareData(null)
        }}
        jobId={currentJobId}
        fetchCSV={fetchCSV}
        compareData={compareData}
      />
      <ViewPlotModal
        open={openPlotModal}
        onClose={() => setOpenPlotModal(false)}
        data={currentData}
        jobId={currentJobId}
        compareChart={compareChart}
      />
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
        setFileName={setFileNameForDetailedReport}
        fileName={fileNameForDetailedReport}
      />
         <TensorboardModal
              currentTensorboard={currentTensorboardForModal}
              setCurrentTensorboard={setCurrentTensorboardForModal}
            />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Typography level="h3">Executions</Typography>
        {selected.length > 1 && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Typography
              level="body-sm"
              startDecorator={<ChartColumnIncreasingIcon size="20px" />}
              onClick={() => handleCombinedReports('summary')}
              sx={{ cursor: 'pointer' }}
            >
              Compare Selected Evals
            </Typography>
            <Typography
              level="body-sm"
              startDecorator={<Grid3X3Icon size="20px" />}
              onClick={() => handleCombinedReports('detailed')}
              sx={{ cursor: 'pointer' }}
            >
              Detailed Comparison
            </Typography>
          </Box>
        )}
      </Box>

      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th
                style={{ width: 48, textAlign: 'center', padding: '6px 6px' }}
              >
                <Checkbox
                  size="sm"
                  indeterminate={
                    selected.length > 0 && selected.length !== jobs.length
                  }
                  checked={selected.length === jobs.length}
                  onChange={(event) => {
                    setSelected(
                      event.target.checked ? jobs.map((row) => row.id) : []
                    );
                  }}
                  color={
                    selected.length > 0 || selected.length === jobs.length
                      ? 'primary'
                      : undefined
                  }
                  sx={{ verticalAlign: 'text-bottom' }}
                />
              </th>
              <th width="50px">Id</th>
              <th>Eval</th>
              <th>Progress</th>
              <th>Score</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job) => (
              <tr key={job.id}>
                <td style={{ textAlign: 'center', width: 120 }}>
                  <Checkbox
                    size="sm"
                    checked={selected.includes(job?.id)}
                    color={selected.includes(job?.id) ? 'primary' : undefined}
                    onChange={(event) => {
                      setSelected((ids) =>
                        event.target.checked
                          ? ids.concat(job?.id)
                          : ids.filter((itemId) => itemId !== job?.id)
                      );
                    }}
                    slotProps={{
                      checkbox: { sx: { textAlign: 'left' } },
                    }}
                    sx={{ verticalAlign: 'text-bottom' }}
                  />
                </td>
                <td>{job.id}</td>
                <td>
                  <Typography level="title-md">
                    {job?.job_data?.evaluator}
                  </Typography>
                  <Typography level="title-sm">
                    {job?.job_data?.plugin}
                  </Typography>
                </td>
                <td>
                  <JobProgress job={job} />
                </td>
                <td>
                  <RenderScore score={job?.job_data?.score} />
                  {job?.job_data?.additional_output_path &&
                    (job.job_data.additional_output_path
                      .toLowerCase()
                      .endsWith('.csv') ? (
                      <Link
                        onClick={() => handleOpenCSVModal(job?.id)}
                        sx={{ mt: 1, ml: 1 }}
                        startDecorator={<Grid3X3Icon size="14px" />}
                      >
                        Detailed Report
                      </Link>
                    ) : (
                      <Link
                        onClick={() => {
                          setFileNameForDetailedReport(
                            job?.job_data?.additional_output_path
                          );
                          setViewOutputFromJob(job?.id);
                        }}
                        sx={{ mt: 1, ml: 1 }}
                        startDecorator={<Grid3X3Icon size="14px" />}
                      >
                        Detailed Report
                      </Link>
                    ))}
                  {job?.job_data?.plot_data_path && (
                    <Link
                      onClick={() =>
                        handleOpenPlotModal(job?.id, job?.job_data?.score)
                      }
                      sx={{ mt: 1, ml: 1 }}
                      startDecorator={<ChartColumnIncreasingIcon size="14px" />}
                    >
                      Chart
                    </Link>
                  )}
                </td>
                <td>
                  <ButtonGroup
                    variant="soft"
                    sx={{ justifyContent: 'flex-end' }}
                  >
                          {job?.job_data?.tensorboard_output_dir && (
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => {
                                setCurrentTensorboardForModal(job?.id);
                              }}
                              startDecorator={<LineChartIcon />}
                            >
                              Tensorboard
                            </Button>
                          )}
                    <Button
                      onClick={() => {
                        setViewOutputFromJob(job?.id);
                      }}
                    >
                      View Output
                    </Button>
                    <IconButton variant="plain">
                      <Trash2Icon
                        onClick={async () => {
                          await fetch(chatAPI.Endpoints.Jobs.Delete(job?.id));
                          jobsMutate();
                        }}
                      />
                    </IconButton>
                  </ButtonGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {/* <Box sx={{ overflow: 'scroll' }}>
        <pre>{JSON.stringify(jobs, null, 2)}</pre>
      </Box> */}
      </Sheet>
    </>
  );
};

export default EvalJobsTable;
