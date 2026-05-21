import React from 'react';
import { Box, Typography, Sheet, Stack } from '@mui/joy';
import { ResponsiveBar } from '@nivo/bar';
import { JobRecord } from './jobDetailUtils';

interface StatusHistoryEntry {
  status: string;
  timestamp_ms: number;
}

interface Phase {
  phase: string;
  duration_ms: number;
}

const TERMINAL_STATUSES = new Set(['COMPLETE', 'FAILED', 'STOPPED', 'DELETED']);

function phasesFromStatusHistory(
  history: StatusHistoryEntry[],
  jobStatus: string | undefined,
  finishedAtMs: number | null,
): Phase[] {
  const phases: Phase[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    phases.push({
      phase: history[i].status,
      duration_ms: history[i + 1].timestamp_ms - history[i].timestamp_ms,
    });
  }
  // Close out the trailing phase if the job is terminal and we have an end time.
  if (history.length > 0 && jobStatus && TERMINAL_STATUSES.has(jobStatus)) {
    const last = history[history.length - 1];
    if (finishedAtMs && finishedAtMs > last.timestamp_ms) {
      phases.push({
        phase: last.status,
        duration_ms: finishedAtMs - last.timestamp_ms,
      });
    }
  }
  return phases;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

function derivePhases(job: JobRecord): Phase[] {
  const jd: any = job.job_data ?? {};
  const history: StatusHistoryEntry[] = Array.isArray(jd.status_history)
    ? (jd.status_history as StatusHistoryEntry[]).filter(
        (h) => h && typeof h.timestamp_ms === 'number' && h.status,
      )
    : [];
  const finishedAtMs = jd.finished_at
    ? Date.parse(String(jd.finished_at))
    : null;

  const phases = phasesFromStatusHistory(history, job.status, finishedAtMs);

  return phases
    .filter((p) => p.duration_ms > 0)
    .sort((a, b) => b.duration_ms - a.duration_ms);
}

export default function PerformanceSection({ job }: { job: JobRecord }) {
  const phases = derivePhases(job);

  if (phases.length === 0) {
    return (
      <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
        Not enough timing data yet for this job.
      </Typography>
    );
  }

  const totalMs = phases.reduce((sum, p) => sum + p.duration_ms, 0);
  const data = phases.map((p) => ({
    phase: p.phase,
    duration: p.duration_ms / 1000,
    label: formatDuration(p.duration_ms),
  }));

  return (
    <Stack spacing={2}>
      <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
        Total measured: {formatDuration(totalMs)}
      </Typography>
      <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'sm' }}>
        <Typography level="title-sm" sx={{ mb: 1 }}>
          Time by phase
        </Typography>
        <Box sx={{ height: Math.max(160, phases.length * 36 + 80) }}>
          <ResponsiveBar
            data={data}
            keys={['duration']}
            indexBy="phase"
            layout="horizontal"
            margin={{ top: 10, right: 80, bottom: 40, left: 120 }}
            padding={0.25}
            valueFormat={(v) => formatDuration(Number(v) * 1000)}
            axisBottom={{
              legend: 'seconds',
              legendPosition: 'middle',
              legendOffset: 32,
            }}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            theme={{
              axis: {
                ticks: { text: { fontWeight: 600, fontSize: 14 } },
              },
            }}
            colors={{ scheme: 'category10' }}
            enableGridX
            enableGridY={false}
            enableLabel={false}
            tooltip={({ indexValue, value }) => (
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  bgcolor: 'background.surface',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 'sm',
                  fontSize: 'xs',
                }}
              >
                <strong>{indexValue}</strong>:{' '}
                {formatDuration(Number(value) * 1000)}
              </Box>
            )}
            layers={[
              'grid',
              'axes',
              'bars',
              ({ bars }) => (
                <g>
                  {bars.map((bar) => {
                    const label = formatDuration(Number(bar.data.value) * 1000);
                    // Place label outside the bar (to the right) so it's always
                    // readable regardless of bar width or color contrast.
                    return (
                      <text
                        key={bar.key}
                        x={bar.x + bar.width + 6}
                        y={bar.y + bar.height / 2}
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--joy-palette-text-secondary, #555)',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {label}
                      </text>
                    );
                  })}
                </g>
              ),
              'markers',
              'legends',
            ]}
            animate={false}
          />
        </Box>
      </Sheet>
    </Stack>
  );
}
