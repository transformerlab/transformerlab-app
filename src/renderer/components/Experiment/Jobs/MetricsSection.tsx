import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Sheet,
  CircularProgress,
  Chip,
} from '@mui/joy';
import { ResponsiveLine } from '@nivo/line';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useJobMetrics, MetricRow } from 'renderer/lib/hooks/useJobMetrics';
import { JobRecord } from './jobDetailUtils';

const RUNNING_STATUSES = new Set([
  'RUNNING',
  'LAUNCHING',
  'QUEUED',
  'IN_PROGRESS',
]);

function buildSeries(
  rows: MetricRow[],
  metricKey: string,
  hasStep: boolean,
): { id: string; data: { x: number | string; y: number }[] }[] {
  return [
    {
      id: metricKey,
      data: rows
        .filter((r) => r.metrics && r.metrics[metricKey] !== undefined)
        .map((r) => ({
          x: hasStep ? (r.step as number) : r.t,
          y: r.metrics![metricKey],
        })),
    },
  ];
}

function MetricChart({
  metricKey,
  rows,
  hasStep,
}: {
  metricKey: string;
  rows: MetricRow[];
  hasStep: boolean;
}) {
  const data = buildSeries(rows, metricKey, hasStep);
  return (
    <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'sm' }}>
      <Typography level="title-sm" sx={{ mb: 1 }}>
        {metricKey}
      </Typography>
      <Box sx={{ height: 200 }}>
        <ResponsiveLine
          data={data}
          margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
          xScale={hasStep ? { type: 'linear' } : { type: 'point' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          axisBottom={{ tickRotation: hasStep ? 0 : 30 }}
          axisLeft={{ tickSize: 5 }}
          enablePoints={false}
          enableArea={false}
          useMesh
          animate={false}
        />
      </Box>
    </Sheet>
  );
}

function ProgressChart({
  rows,
  hasStep,
}: {
  rows: MetricRow[];
  hasStep: boolean;
}) {
  const data = [
    {
      id: 'progress',
      data: rows.map((r) => ({
        x: hasStep ? (r.step as number) : r.t,
        y: r.progress,
      })),
    },
  ];
  return (
    <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'sm' }}>
      <Typography level="title-sm" sx={{ mb: 1 }}>
        progress
      </Typography>
      <Box sx={{ height: 160 }}>
        <ResponsiveLine
          data={data}
          margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
          xScale={hasStep ? { type: 'linear' } : { type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: 100 }}
          axisBottom={{ tickRotation: hasStep ? 0 : 30 }}
          axisLeft={{ tickSize: 5 }}
          enablePoints={false}
          enableArea={false}
          useMesh
          animate={false}
        />
      </Box>
    </Sheet>
  );
}

export default function MetricsSection({ job }: { job: JobRecord }) {
  const { experimentInfo } = useExperimentInfo();
  const isRunning = RUNNING_STATUSES.has(job.status ?? '');

  const { rows, metricKeys, isLoading, isError } = useJobMetrics(
    experimentInfo?.id ? String(experimentInfo.id) : undefined,
    job.id,
    { pollMs: isRunning ? 2000 : 0 },
  );

  const current =
    ((job.job_data as any)?.current_metrics as
      Record<string, number> | undefined) ?? undefined;

  if (isLoading && rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError) {
    return (
      <Typography color="danger">
        Failed to load metrics for this job.
      </Typography>
    );
  }
  if (rows.length === 0) {
    return (
      <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
        No metrics have been reported for this job yet.
      </Typography>
    );
  }

  const hasStep = rows.every((r) => typeof r.step === 'number');

  return (
    <Stack spacing={2}>
      {current && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {Object.entries(current).map(([k, v]) => (
            <Chip key={k} variant="soft" size="sm">
              {k}: {v}
            </Chip>
          ))}
        </Stack>
      )}
      <ProgressChart rows={rows} hasStep={hasStep} />
      {metricKeys.map((k) => (
        <MetricChart key={k} metricKey={k} rows={rows} hasStep={hasStep} />
      ))}
    </Stack>
  );
}
