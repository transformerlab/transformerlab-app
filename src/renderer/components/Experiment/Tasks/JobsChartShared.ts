export type ChartPointKind = 'scored' | 'discarded' | 'no_metric';

export interface ChartPoint {
  x: Date;
  y: number;
  jobId: string;
  description: string;
  kind: ChartPointKind;
  isBest: boolean;
  metricLabel: string;
  statusNote?: string;
}

export interface EvalTableRow {
  jobId: string;
  status: string;
  description: string;
  createdAt: Date | null;
  discarded: boolean;
  metrics: Record<string, number>;
}

export interface GraphModel {
  points: ChartPoint[];
  bestForStepLine: ChartPoint[];
  primaryMetric: string | null;
  axisLegend: string;
}

export function parseDiscardValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number')
    return value === 0 || value === 1 ? Boolean(value) : false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const numeric = Number.parseInt(normalized, 10);
    return Number.isNaN(numeric) ? false : numeric === 1;
  }
  return false;
}

export function parseNumericScoreFields(
  score: unknown,
): Record<string, number> {
  if (typeof score === 'number' && Number.isFinite(score)) return { score };
  if (typeof score === 'string') {
    const parsed = Number.parseFloat(score);
    return Number.isFinite(parsed) ? { score: parsed } : {};
  }
  if (score && typeof score === 'object') {
    return Object.entries(score as Record<string, unknown>).reduce(
      (acc, [key, value]) => {
        if (key.toLowerCase() === 'discard') return acc;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) acc[key] = numeric;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
  return {};
}

export function computePrimaryMetricKey(jobs: unknown[]): string | null {
  const metricKeys = jobs
    .map((job) =>
      parseNumericScoreFields(
        (job as { job_data?: { score?: unknown } })?.job_data?.score,
      ),
    )
    .map((fields) => Object.keys(fields))
    .find((keys) => keys.length > 0);
  if (!metricKeys) return null;
  return metricKeys.find((k) => k.toLowerCase() === 'score') ?? metricKeys[0];
}

export function resolveLowerIsBetter(jobs: unknown[]): boolean {
  const counts = jobs.reduce(
    (acc, job) => {
      const value = (job as { job_data?: { lower_is_better?: boolean } })
        ?.job_data?.lower_is_better;
      if (value === true) acc.trueCount += 1;
      if (value === false) acc.falseCount += 1;
      return acc;
    },
    { trueCount: 0, falseCount: 0 },
  );
  if (counts.trueCount === 0 && counts.falseCount === 0) return false;
  return counts.trueCount > counts.falseCount;
}

export function extractDate(job: {
  created_at?: string;
  job_data?: { start_time?: string; end_time?: string };
}): Date | null {
  const raw =
    job.created_at ??
    job.job_data?.start_time ??
    job.job_data?.end_time ??
    null;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getJobDescription(job: {
  job_data?: { description?: unknown };
}): string {
  const description = job.job_data?.description;
  return typeof description === 'string' ? description.trim() : '';
}

export function getDefaultMetricKey(
  metricKeys: string[],
  fallback: string | null,
): string {
  if (metricKeys.length === 0) return '';
  if (fallback && metricKeys.includes(fallback)) return fallback;
  return (
    metricKeys.find((key) => key.toLowerCase() === 'score') ?? metricKeys[0]
  );
}

export function buildEvalRows(jobs: unknown[]): EvalTableRow[] {
  return jobs
    .map((job) => {
      const parsed = job as {
        id?: string | number;
        status?: string;
        created_at?: string;
        job_data?: {
          score?: unknown;
          discard?: unknown;
          description?: unknown;
          start_time?: string;
          end_time?: string;
        };
      };
      const metrics = parseNumericScoreFields(parsed.job_data?.score);
      const scoreObj =
        parsed.job_data?.score && typeof parsed.job_data.score === 'object'
          ? (parsed.job_data.score as Record<string, unknown>)
          : null;
      return {
        jobId: String(parsed.id ?? ''),
        status: String(parsed.status ?? ''),
        description: getJobDescription(parsed),
        createdAt: extractDate(parsed),
        discarded:
          parseDiscardValue(parsed.job_data?.discard) ||
          parseDiscardValue(scoreObj?.discard),
        metrics,
      };
    })
    .filter((row) => Object.keys(row.metrics).length > 0)
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
}

export function buildGraphModel(
  jobs: unknown[],
  metricKey: string,
  lowerIsBetter: boolean,
): GraphModel {
  const primaryMetric = metricKey || computePrimaryMetricKey(jobs);
  const axisLegend = primaryMetric ? `Score (${primaryMetric})` : 'Score';
  const points = jobs
    .map((job) => {
      const parsed = job as {
        id?: string | number;
        created_at?: string;
        job_data?: {
          score?: unknown;
          discard?: unknown;
          description?: unknown;
          start_time?: string;
          end_time?: string;
        };
      };
      const date = extractDate(parsed);
      if (!date) return null;
      const score = parsed.job_data?.score;
      const fields = parseNumericScoreFields(score);
      const yValue = primaryMetric ? fields[primaryMetric] : undefined;
      if (yValue === undefined) return null;
      const scoreObj =
        score && typeof score === 'object'
          ? (score as Record<string, unknown>)
          : null;
      const discarded =
        parseDiscardValue(scoreObj?.discard) ||
        parseDiscardValue(parsed.job_data?.discard);
      return {
        x: date,
        y: yValue,
        jobId: String(parsed.id ?? ''),
        description: getJobDescription(parsed),
        kind: discarded ? ('discarded' as const) : ('scored' as const),
        isBest: false,
        metricLabel: primaryMetric || 'score',
      };
    })
    .filter((row): row is ChartPoint => row !== null)
    .sort((a, b) => a.x.getTime() - b.x.getTime());

  let runningExtreme = lowerIsBetter ? Infinity : -Infinity;
  const withBest = points.map((point) => {
    if (point.kind !== 'scored') return point;
    const better = lowerIsBetter
      ? point.y < runningExtreme
      : point.y > runningExtreme;
    if (better) runningExtreme = point.y;
    return { ...point, isBest: better };
  });
  const bestForStepLine = withBest.filter(
    (point) => point.kind === 'scored' && point.isBest,
  );
  return { points: withBest, bestForStepLine, primaryMetric, axisLegend };
}
