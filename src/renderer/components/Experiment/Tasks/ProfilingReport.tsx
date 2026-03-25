import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Divider,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface GpuSummary {
  index: number;
  peak_util_percent?: number;
  avg_util_percent?: number;
  peak_mem_used_mb?: number;
  avg_mem_used_mb?: number;
  mem_total_mb?: number;
}

interface ProfilingData {
  wall_time_sec?: number;
  sample_count?: number;
  interval_sec?: number;
  cpu?: {
    peak_percent?: number;
    avg_percent?: number;
  };
  memory?: {
    peak_rss_mb?: number;
    avg_rss_mb?: number;
  };
  gpus?: GpuSummary[];
}

function formatMb(mb: number | undefined): string {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatPct(v: number | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function formatSec(sec: number | undefined): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

interface StatCardProps {
  label: string;
  peak: string;
  avg: string;
}

function StatCard({ label, peak, avg }: StatCardProps) {
  return (
    <Card variant="soft" sx={{ minWidth: 140 }}>
      <CardContent>
        <Typography level="body-xs" textColor="neutral.500" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
        <Typography level="title-md">{peak}</Typography>
        <Typography level="body-xs" textColor="neutral.500">
          avg {avg}
        </Typography>
      </CardContent>
    </Card>
  );
}

interface ProfilingReportProps {
  jobId: string | null;
}

export default function ProfilingReport({ jobId }: ProfilingReportProps) {
  const { experimentInfo } = useExperimentInfo();

  const url =
    jobId && experimentInfo?.id
      ? chatAPI.Endpoints.Experiment.GetProfilingReport(
          experimentInfo.id,
          String(jobId),
        )
      : null;

  const { data, isLoading, isError } = useSWR(url);

  if (!url || isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography level="body-sm" color="neutral">
          Loading profiling report…
        </Typography>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography level="body-sm" color="neutral">
          No profiling report available. Enable profiling when launching the job
          to capture CPU and GPU metrics.
        </Typography>
      </Box>
    );
  }

  const report = data as ProfilingData;

  return (
    <Box sx={{ p: 2, overflowY: 'auto' }}>
      <Stack spacing={2}>
        {/* Summary row */}
        <Stack direction="row" spacing={1.5} flexWrap="wrap">
          <Card variant="soft" sx={{ minWidth: 140 }}>
            <CardContent>
              <Typography
                level="body-xs"
                textColor="neutral.500"
                sx={{ mb: 0.5 }}
              >
                Wall Time
              </Typography>
              <Typography level="title-md">
                {formatSec(report.wall_time_sec)}
              </Typography>
              <Typography level="body-xs" textColor="neutral.500">
                {report.sample_count ?? 0} samples / {report.interval_sec ?? 5}s
              </Typography>
            </CardContent>
          </Card>

          {report.cpu && (
            <StatCard
              label="CPU"
              peak={formatPct(report.cpu.peak_percent)}
              avg={formatPct(report.cpu.avg_percent)}
            />
          )}

          {report.memory && (
            <StatCard
              label="Memory (RSS)"
              peak={formatMb(report.memory.peak_rss_mb)}
              avg={formatMb(report.memory.avg_rss_mb)}
            />
          )}
        </Stack>

        {/* GPU table */}
        {report.gpus && report.gpus.length > 0 && (
          <>
            <Divider />
            <Typography level="title-sm">GPU Summary</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="sm" borderAxis="xBetween" hoverRow>
                <thead>
                  <tr>
                    <th>GPU</th>
                    <th>Peak Util</th>
                    <th>Avg Util</th>
                    <th>Peak Mem</th>
                    <th>Avg Mem</th>
                    <th>Total Mem</th>
                  </tr>
                </thead>
                <tbody>
                  {report.gpus.map((g) => (
                    <tr key={g.index}>
                      <td>GPU {g.index}</td>
                      <td>{formatPct(g.peak_util_percent)}</td>
                      <td>{formatPct(g.avg_util_percent)}</td>
                      <td>{formatMb(g.peak_mem_used_mb)}</td>
                      <td>{formatMb(g.avg_mem_used_mb)}</td>
                      <td>{formatMb(g.mem_total_mb)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          </>
        )}

        {/* Note about torch trace */}
        {report.gpus === undefined && !report.cpu && (
          <Typography level="body-xs" color="neutral">
            No resource samples were collected. The job may have been too short
            to capture data.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
