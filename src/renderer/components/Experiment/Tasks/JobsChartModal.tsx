import { useMemo } from 'react';
import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import { ResponsiveLine } from '@nivo/line';

interface JobsChartModalProps {
  open: boolean;
  onClose: () => void;
  jobs: unknown[];
}

type ChartPointKind = 'scored' | 'discarded' | 'no_metric';

interface ChartPoint {
  x: Date;
  y: number;
  jobId: string;
  description: string;
  kind: ChartPointKind;
  isBest: boolean;
  metricLabel: string;
  statusNote?: string;
}

const BEST_COLOR = '#22c55e';
const BEST_BORDER = '#15803d';
const POINT_COLOR = '#3b82f6';
const DISCARD_POINT_FILL = '#94a3b8';
const DISCARD_POINT_STROKE = '#64748b';
const NO_METRIC_POINT_FILL = '#cbd5e1';
const NO_METRIC_POINT_STROKE = '#94a3b8';

function parseDiscardValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 0 || value === 1) {
      return Boolean(value);
    }
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    const numeric = Number.parseInt(normalized, 10);
    if (Number.isNaN(numeric)) {
      return false;
    }
    return numeric === 1;
  }
  return false;
}

/** Numeric score fields only (excludes `discard` and non-numeric keys). */
function parseNumericScoreFields(score: unknown): Record<string, number> {
  if (typeof score === 'number' && Number.isFinite(score)) {
    return { score };
  }
  if (typeof score === 'string') {
    const parsed = Number.parseFloat(score);
    return Number.isFinite(parsed) ? { score: parsed } : {};
  }
  if (score && typeof score === 'object') {
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(score as Record<string, unknown>)) {
      if (key.toLowerCase() === 'discard') continue;
      const n = Number(val);
      if (Number.isFinite(n)) {
        out[key] = n;
      }
    }
    return out;
  }
  return {};
}

function computePrimaryMetricKey(jobs: unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const fields = parseNumericScoreFields(
      (job as { job_data?: { score?: unknown } })?.job_data?.score,
    );
    for (const k of Object.keys(fields)) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return null;
  }
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    const aPreferred = a[0].toLowerCase() === 'score' ? 0 : 1;
    const bPreferred = b[0].toLowerCase() === 'score' ? 0 : 1;
    if (aPreferred !== bPreferred) {
      return aPreferred - bPreferred;
    }
    return a[0].localeCompare(b[0]);
  });
  return ranked[0][0];
}

function resolveLowerIsBetter(jobs: unknown[]): boolean {
  let trueCount = 0;
  let falseCount = 0;
  for (const job of jobs) {
    const v = (job as { job_data?: { lower_is_better?: boolean } })?.job_data
      ?.lower_is_better;
    if (v === true) {
      trueCount += 1;
    } else if (v === false) {
      falseCount += 1;
    }
  }
  if (trueCount === 0 && falseCount === 0) {
    return false;
  }
  return trueCount > falseCount;
}

function extractDate(job: {
  created_at?: string;
  job_data?: { start_time?: string; end_time?: string };
}): Date | null {
  const raw =
    job?.created_at ??
    job?.job_data?.start_time ??
    job?.job_data?.end_time ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getJobDescription(job: {
  job_data?: { description?: unknown };
}): string {
  const d = job?.job_data?.description;
  if (typeof d === 'string') {
    return d.trim();
  }
  return '';
}

export default function JobsChartModal({
  open,
  onClose,
  jobs,
}: JobsChartModalProps) {
  const { points, bestForStepLine, primaryMetric, lowerIsBetter, axisLegend } =
    useMemo(() => {
      if (!Array.isArray(jobs)) {
        return {
          points: [] as ChartPoint[],
          bestForStepLine: [] as ChartPoint[],
          primaryMetric: null as string | null,
          lowerIsBetter: false,
          axisLegend: 'Score',
        };
      }

      const primaryKey = computePrimaryMetricKey(jobs);
      const lowerBetter = resolveLowerIsBetter(jobs);
      const axis = primaryKey ? `Score (${primaryKey})` : 'Score';

      type RawRow = {
        x: Date;
        jobId: string;
        description: string;
        discarded: boolean;
        kind: ChartPointKind;
        yValue: number | null;
        metricLabel: string;
        statusNote?: string;
      };

      const rows: RawRow[] = [];

      for (const job of jobs) {
        const j = job as {
          id?: string | number;
          status?: string;
          created_at?: string;
          job_data?: {
            score?: unknown;
            description?: unknown;
            discard?: unknown;
            start_time?: string;
            end_time?: string;
          };
        };
        const date = extractDate(j);
        if (!date) continue;

        const score = j?.job_data?.score;
        const fields = parseNumericScoreFields(score);
        const discardFromScore =
          score && typeof score === 'object'
            ? (score as Record<string, unknown>).discard
            : undefined;
        const discarded =
          parseDiscardValue(discardFromScore) ||
          parseDiscardValue(j?.job_data?.discard);

        const description = getJobDescription(j);
        const jobId = String(j?.id ?? '');

        let yValue: number | null = null;
        let metricLabel = primaryKey ? primaryKey : 'score';
        let kind: ChartPointKind = 'scored';
        let statusNote: string | undefined;

        if (primaryKey && fields[primaryKey] !== undefined) {
          yValue = fields[primaryKey];
          metricLabel = primaryKey;
        } else if (!primaryKey && Object.keys(fields).length > 0) {
          const preferred =
            Object.entries(fields).find(([k]) => k.toLowerCase() === 'score') ??
            Object.entries(fields)[0];
          if (preferred) {
            metricLabel = preferred[0];
            yValue = preferred[1];
          }
        }

        if (yValue === null) {
          // Hide jobs that don't have a score for this metric.
          continue;
        }
        if (discarded) {
          kind = 'discarded';
        }

        rows.push({
          x: date,
          jobId,
          description,
          discarded,
          kind,
          yValue,
          metricLabel,
          statusNote,
        });
      }

      const scoredYs = rows
        .filter((r) => r.yValue !== null)
        .map((r) => r.yValue as number);
      let minY: number;
      let maxY: number;
      if (scoredYs.length === 0) {
        minY = 0;
        maxY = 1;
      } else {
        minY = Math.min(...scoredYs);
        maxY = Math.max(...scoredYs);
      }
      const span = maxY - minY || 1;
      const baseline = minY - span * 0.12;

      const sorted: ChartPoint[] = rows
        .map((r) => ({
          x: r.x,
          y: r.yValue === null ? baseline : r.yValue,
          jobId: r.jobId,
          description: r.description,
          kind: r.kind,
          isBest: false,
          metricLabel: r.metricLabel,
          statusNote: r.statusNote,
        }))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      let runningExtreme = lowerBetter ? Infinity : -Infinity;
      for (const p of sorted) {
        if (p.kind !== 'scored') continue;
        const better = lowerBetter
          ? p.y < runningExtreme
          : p.y > runningExtreme;
        if (better) {
          p.isBest = true;
          runningExtreme = p.y;
        }
      }

      const bestForLine = sorted.filter((p) => p.isBest && p.kind === 'scored');

      return {
        points: sorted,
        bestForStepLine: bestForLine,
        primaryMetric: primaryKey,
        lowerIsBetter: lowerBetter,
        axisLegend: axis,
      };
    }, [jobs]);

  const chartData = useMemo(
    () => [
      {
        id: 'jobs',
        data: points.map((p) => ({
          x: p.x,
          y: p.y,
          jobId: p.jobId,
          description: p.description,
          kind: p.kind,
          isBest: p.isBest,
          metricLabel: p.metricLabel,
          statusNote: p.statusNote,
        })),
      },
    ],
    [points],
  );

  const BestStepLine = ({ xScale, yScale }: any) => {
    if (bestForStepLine.length < 2) return null;
    const pts = bestForStepLine.map((p) => ({
      x: xScale(p.x),
      y: yScale(p.y),
    }));
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L ${pts[i].x},${pts[i - 1].y} L ${pts[i].x},${pts[i].y}`;
    }
    return (
      <path
        d={path}
        stroke={BEST_COLOR}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="miter"
      />
    );
  };

  const CustomPoints = ({ series, xScale, yScale }: any) => (
    <g>
      {series.flatMap(
        (s: { id: string; data: { data: Record<string, unknown> }[] }) =>
          s.id === 'jobs'
            ? s.data.map((d: { data: Record<string, unknown> }, i: number) => {
                const row = d.data;
                const kind = row.kind as ChartPointKind;
                const isBest = kind === 'scored' && !!row.isBest;
                const cx = xScale(row.x as Date);
                const cy = yScale(row.y as number);
                if (kind === 'no_metric') {
                  return (
                    <circle
                      key={`pt-${i}`}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={NO_METRIC_POINT_FILL}
                      stroke={NO_METRIC_POINT_STROKE}
                      strokeWidth={1}
                      strokeDasharray="3 2"
                    />
                  );
                }
                if (kind === 'discarded') {
                  return (
                    <circle
                      key={`pt-${i}`}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={DISCARD_POINT_FILL}
                      stroke={DISCARD_POINT_STROKE}
                      strokeWidth={1.5}
                    />
                  );
                }
                return (
                  <circle
                    key={`pt-${i}`}
                    cx={cx}
                    cy={cy}
                    r={isBest ? 5 : 4}
                    fill={isBest ? BEST_COLOR : POINT_COLOR}
                    stroke={isBest ? BEST_BORDER : 'none'}
                    strokeWidth={0}
                  />
                );
              })
            : [],
      )}
    </g>
  );

  const subtitle =
    points.length === 0
      ? 'No jobs with a date + score to plot. Create jobs and record scores for them to appear here.'
      : [
          primaryMetric
            ? `Metric: ${primaryMetric} — green marks best so far (${lowerIsBetter ? 'lower' : 'higher'} is better)`
            : `Green marks best so far (${lowerIsBetter ? 'lower' : 'higher'} is better)`,
          'Grey dots are discarded runs.',
        ].join(' ');

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Progress Chart
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
          {subtitle}
        </Typography>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            border: '1px solid',
            borderColor: 'neutral.outlinedBorder',
            borderRadius: 'sm',
          }}
        >
          {points.length > 0 ? (
            <ResponsiveLine
              data={chartData}
              margin={{ top: 24, right: 32, bottom: 64, left: 64 }}
              xScale={{ type: 'time', precision: 'minute' }}
              xFormat="time:%Y-%m-%d %H:%M"
              yScale={{
                type: 'linear',
                min: 'auto',
                max: 'auto',
                stacked: false,
              }}
              axisBottom={{
                format: '%b %d %H:%M',
                tickRotation: -30,
                legend: 'Date',
                legendOffset: 50,
                legendPosition: 'middle',
              }}
              axisLeft={{
                legend: axisLegend,
                legendOffset: -48,
                legendPosition: 'middle',
              }}
              enableGridX={false}
              enableGridY
              colors={[POINT_COLOR]}
              lineWidth={0}
              enablePoints={false}
              layers={[
                'grid',
                'axes',
                BestStepLine,
                CustomPoints,
                'mesh',
                'crosshair',
              ]}
              useMesh
              tooltip={({ point }) => {
                const data = point.data as {
                  jobId?: string;
                  description?: string;
                  kind?: ChartPointKind;
                  isBest?: boolean;
                  metricLabel?: string;
                  statusNote?: string;
                };
                const jobId = data.jobId ?? '';
                const shortId = jobId ? jobId.slice(0, 8) : '';
                const isBest = data.kind === 'scored' && !!data.isBest;
                const desc = data.description?.trim();
                return (
                  <Box
                    sx={{
                      bgcolor: 'background.surface',
                      border: '1px solid',
                      borderColor: 'neutral.outlinedBorder',
                      borderRadius: 'sm',
                      p: 1,
                      fontSize: 12,
                      maxWidth: 320,
                    }}
                  >
                    <div>
                      <b>{shortId}</b>
                      {isBest && (
                        <span style={{ color: BEST_BORDER, marginLeft: 6 }}>
                          best so far
                        </span>
                      )}
                      {data.kind === 'discarded' && (
                        <span
                          style={{ color: DISCARD_POINT_STROKE, marginLeft: 6 }}
                        >
                          discarded
                        </span>
                      )}
                      {data.kind === 'no_metric' && (
                        <span
                          style={{
                            color: NO_METRIC_POINT_STROKE,
                            marginLeft: 6,
                          }}
                        >
                          no metric
                        </span>
                      )}
                    </div>
                    {data.kind === 'no_metric' ? (
                      <div style={{ marginTop: 4, color: '#64748b' }}>
                        {data.statusNote ?? 'No score for this metric'}
                      </div>
                    ) : (
                      <>
                        <div>
                          {data.metricLabel ?? 'score'}:{' '}
                          {String(point.data.yFormatted)}
                        </div>
                        {data.kind === 'discarded' && (
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 11,
                              color: '#64748b',
                            }}
                          >
                            Excluded from best-so-far line
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ marginTop: 4, opacity: 0.85 }}>
                      {String(point.data.xFormatted)}
                    </div>
                    {desc ? (
                      <Typography
                        level="body-xs"
                        sx={{
                          mt: 0.75,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'text.secondary',
                        }}
                      >
                        {desc}
                      </Typography>
                    ) : (
                      <Typography
                        level="body-xs"
                        sx={{
                          mt: 0.75,
                          fontStyle: 'italic',
                          color: 'text.tertiary',
                        }}
                      >
                        No description
                      </Typography>
                    )}
                  </Box>
                );
              }}
            />
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No jobs with a date + score to plot. Create jobs and record
                scores for them to appear here.
              </Typography>
            </Box>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}
