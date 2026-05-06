import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy';
import { LineChartIcon, TableIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import JobsChartGraphView from './JobsChartGraphView';
import JobsChartTableView from './JobsChartTableView';
import {
  buildEvalRows,
  buildGraphModel,
  computePrimaryMetricKey,
  getDefaultMetricKey,
  resolveLowerIsBetter,
} from './JobsChartShared';

interface JobsChartModalProps {
  open: boolean;
  onClose: () => void;
  jobs: unknown[];
}

export default function JobsChartModal({
  open,
  onClose,
  jobs,
}: JobsChartModalProps) {
  const { experimentId } = useExperimentInfo();
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [lowerIsBetterOverride, setLowerIsBetterOverride] = useState<
    boolean | null
  >(null);

  const autoLowerIsBetter = useMemo(
    () => (Array.isArray(jobs) ? resolveLowerIsBetter(jobs) : false),
    [jobs],
  );
  const lowerIsBetter = lowerIsBetterOverride ?? autoLowerIsBetter;

  const evalRows = useMemo(
    () => (Array.isArray(jobs) ? buildEvalRows(jobs) : []),
    [jobs],
  );
  const metricKeys = useMemo(() => {
    const keys = new Set<string>();
    evalRows.forEach((row) => {
      Object.keys(row.metrics).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [evalRows]);
  const primaryMetricFromJobs = useMemo(
    () => (Array.isArray(jobs) ? computePrimaryMetricKey(jobs) : null),
    [jobs],
  );
  const effectiveMetric =
    selectedMetric || getDefaultMetricKey(metricKeys, primaryMetricFromJobs);

  useEffect(() => {
    if (!open) return;
    setViewMode('graph');
    if (metricKeys.length === 0) {
      setSelectedMetric('');
      return;
    }
    if (!metricKeys.includes(effectiveMetric)) {
      setSelectedMetric(getDefaultMetricKey(metricKeys, primaryMetricFromJobs));
    }
  }, [effectiveMetric, metricKeys, open, primaryMetricFromJobs]);

  const graphModel = useMemo(
    () =>
      Array.isArray(jobs)
        ? buildGraphModel(jobs, effectiveMetric, lowerIsBetter)
        : {
            points: [],
            bestForStepLine: [],
            primaryMetric: null,
            axisLegend: 'Score',
          },
    [effectiveMetric, jobs, lowerIsBetter],
  );

  const rowsWithMetric = useMemo(
    () =>
      effectiveMetric
        ? evalRows.filter((row) => row.metrics[effectiveMetric] !== undefined)
        : [],
    [effectiveMetric, evalRows],
  );

  const subtitle =
    graphModel.points.length === 0
      ? 'No jobs with a date + score to plot. Create jobs and record scores for them to appear here.'
      : [
          graphModel.primaryMetric
            ? `Metric: ${graphModel.primaryMetric} — green marks best so far.`
            : 'Green marks best so far.',
          'Grey dots are discarded runs.',
        ].join(' ');

  const bodyContent =
    viewMode === 'graph' && graphModel.points.length > 0 ? (
      <JobsChartGraphView
        model={graphModel}
        onClose={onClose}
        experimentId={experimentId}
      />
    ) : (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: '1px solid',
          borderColor: 'neutral.outlinedBorder',
          borderRadius: 'sm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          No jobs with a date + score to plot. Create jobs and record scores for
          them to appear here.
        </Typography>
      </Box>
    );

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>
        <ModalClose />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1, pr: 4 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography level="title-lg">Progress Chart</Typography>
            <Button
              size="sm"
              variant={viewMode === 'graph' ? 'soft' : 'outlined'}
              onClick={() => setViewMode('graph')}
              startDecorator={<LineChartIcon size={14} />}
            >
              Graph
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'soft' : 'outlined'}
              onClick={() => setViewMode('table')}
              startDecorator={<TableIcon size={14} />}
            >
              Table
            </Button>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {metricKeys.length > 0 && (
              <Select
                size="sm"
                value={effectiveMetric}
                onChange={(_, value) => setSelectedMetric(String(value ?? ''))}
                sx={{ minWidth: 200 }}
              >
                {metricKeys.map((key) => (
                  <Option key={key} value={key}>
                    {key}
                  </Option>
                ))}
              </Select>
            )}
            {viewMode === 'graph' && graphModel.points.length > 0 && (
              <Checkbox
                size="sm"
                label="Lower is better"
                checked={lowerIsBetter}
                onChange={(event) =>
                  setLowerIsBetterOverride(event.target.checked)
                }
              />
            )}
          </Stack>
        </Stack>
        <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
          {subtitle}
        </Typography>
        {viewMode === 'table' ? (
          <JobsChartTableView
            rows={rowsWithMetric}
            metric={effectiveMetric}
            experimentId={experimentId}
            onClose={onClose}
          />
        ) : (
          bodyContent
        )}
      </ModalDialog>
    </Modal>
  );
}
