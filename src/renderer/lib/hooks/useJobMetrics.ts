import { useMemo } from 'react';
import { useSWRWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export interface MetricRow {
  t: string;
  progress: number;
  step?: number;
  metrics?: Record<string, number>;
}

interface UseJobMetricsResult {
  rows: MetricRow[];
  metricKeys: string[];
  isLoading: boolean;
  isError: boolean;
}

export function useJobMetrics(
  experimentId: string | undefined,
  jobId: string | undefined,
  options: { pollMs?: number } = {},
): UseJobMetricsResult {
  const key =
    experimentId && jobId
      ? chatAPI.Endpoints.Jobs.Metrics(experimentId, jobId)
      : null;

  const { data, isLoading, isError } = useSWRWithAuth(key, null, {
    refreshInterval: options.pollMs ?? 0,
    revalidateOnFocus: false,
  });

  const rows: MetricRow[] = data?.rows ?? [];

  const metricKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.metrics) Object.keys(r.metrics).forEach((k) => seen.add(k));
    }
    return Array.from(seen);
  }, [rows]);

  return { rows, metricKeys, isLoading, isError };
}
