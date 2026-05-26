import React from 'react';
import { Box, Typography, Sheet, Stack } from '@mui/joy';
import { JobRecord } from './jobDetailUtils';

interface Phase {
  phase: string;
  duration_ms: number;
}

interface LaunchStep {
  timestamp?: string;
  phase?: string;
  message?: string;
}

const PHASE_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
];

function parseGmtToMs(ts: unknown): number | null {
  if (typeof ts !== 'string' || !ts.trim()) return null;
  const iso = ts.trim().replace(' ', 'T') + 'Z';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
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
  const jd = job.job_data ?? {};
  const startMs = parseGmtToMs(jd.start_time);
  const endMs = parseGmtToMs(jd.end_time) ?? parseGmtToMs(jd.stop_time);

  if (startMs === null || endMs === null) return [];

  const createdMs = job.created_at ? Date.parse(String(job.created_at)) : null;
  const phases: Phase[] = [];

  if (createdMs !== null && !Number.isNaN(createdMs) && startMs > createdMs) {
    phases.push({ phase: 'Queued', duration_ms: startMs - createdMs });
  }

  const lp = jd.launch_progress;
  const steps: LaunchStep[] =
    lp &&
    typeof lp === 'object' &&
    Array.isArray((lp as Record<string, unknown>).steps)
      ? ((lp as Record<string, unknown>).steps as LaunchStep[]).filter(
          (s) => s && typeof s.timestamp === 'string',
        )
      : [];

  if (steps.length > 0) {
    const stepTimestamps = steps
      .map((s) => ({
        phase: s.phase || s.message || 'launch',
        ms: parseGmtToMs(s.timestamp),
      }))
      .filter((s): s is { phase: string; ms: number } => s.ms !== null);

    for (let i = 0; i < stepTimestamps.length; i++) {
      const from = i === 0 ? startMs : stepTimestamps[i - 1].ms;
      const to = stepTimestamps[i].ms;
      if (to > from) {
        phases.push({
          phase: stepTimestamps[i].phase,
          duration_ms: to - from,
        });
      }
    }

    const lastStepMs = stepTimestamps[stepTimestamps.length - 1]?.ms;
    if (lastStepMs && endMs > lastStepMs) {
      phases.push({ phase: 'Running', duration_ms: endMs - lastStepMs });
    }
  } else {
    if (endMs > startMs) {
      phases.push({ phase: 'Running', duration_ms: endMs - startMs });
    }
  }

  const merged: Phase[] = [];
  for (const p of phases) {
    const prev = merged.find((m) => m.phase === p.phase);
    if (prev) {
      prev.duration_ms += p.duration_ms;
    } else {
      merged.push({ ...p });
    }
  }
  return merged.filter((p) => p.duration_ms > 0);
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
  const maxMs = Math.max(...phases.map((p) => p.duration_ms));

  return (
    <Stack spacing={2}>
      <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
        Total measured: {formatDuration(totalMs)}
      </Typography>
      <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'sm' }}>
        <Typography level="title-sm" sx={{ mb: 2 }}>
          Time by phase
        </Typography>
        <Stack spacing={1}>
          {phases.map((p, i) => (
            <Box
              key={p.phase}
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Typography
                level="body-sm"
                sx={{
                  width: 160,
                  textAlign: 'right',
                  flexShrink: 0,
                  fontWeight: 600,
                }}
              >
                {p.phase}
              </Typography>
              <Box
                sx={{
                  flex: 1,
                  position: 'relative',
                  height: 24,
                  bgcolor: 'neutral.100',
                  borderRadius: 'xs',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    width: `${(p.duration_ms / maxMs) * 100}%`,
                    height: '100%',
                    bgcolor: PHASE_COLORS[i % PHASE_COLORS.length],
                    borderRadius: 'xs',
                    minWidth: 2,
                  }}
                />
              </Box>
              <Typography
                level="body-sm"
                sx={{ width: 60, flexShrink: 0, fontWeight: 600 }}
              >
                {formatDuration(p.duration_ms)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Sheet>
    </Stack>
  );
}
