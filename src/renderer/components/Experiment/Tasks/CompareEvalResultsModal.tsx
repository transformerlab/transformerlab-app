import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Box,
  Typography,
  Select,
  Option,
  FormControl,
  FormLabel,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/joy';
import { CheckIcon } from 'lucide-react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import Chart, { type ChartMetric } from './Chart';

async function fetchJson(url: string): Promise<any> {
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatColumnNames(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str: string) => str.toUpperCase())
    .replace(/_/g, ' ');
}

interface JobReport {
  header: string[];
  body: unknown[][];
}

const EMPTY_REPORT: JobReport = { header: [], body: [] };

interface CompareEvalResultsModalProps {
  open: boolean;
  onClose: () => void;
  jobIds: Array<number | string>;
}

const CompareEvalResultsModal = ({
  open,
  onClose,
  jobIds,
}: CompareEvalResultsModalProps) => {
  const { experimentInfo } = useExperimentInfo();
  const [fileIndexByJob, setFileIndexByJob] = useState<Record<string, number>>(
    {},
  );
  const [chartCategoryCol, setChartCategoryCol] = useState<number>(0);
  const [chartValueCols, setChartValueCols] = useState<number[]>([]);

  const normalizedIds = useMemo(() => jobIds.map((id) => String(id)), [jobIds]);
  const hasEnoughJobs = normalizedIds.length >= 2;
  const experimentId = experimentInfo?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setFileIndexByJob((prev) => {
      const next: Record<string, number> = {};
      normalizedIds.forEach((id) => {
        next[id] = prev[id] ?? 0;
      });
      return next;
    });
  }, [open, normalizedIds]);

  const jobsKey =
    open && experimentId && hasEnoughJobs
      ? ['compare-jobs', experimentId, normalizedIds.join(',')]
      : null;

  const {
    data: jobsData,
    isLoading: isLoadingJobs,
    error: jobsError,
  } = useSWR<any[]>(jobsKey, async () => {
    const responses = await Promise.all(
      normalizedIds.map((id) =>
        fetchJson(chatAPI.Endpoints.Jobs.Get(experimentId as any, id)),
      ),
    );
    return responses;
  });

  const evalFilesByIndex: string[][] = useMemo(() => {
    if (!Array.isArray(jobsData)) return normalizedIds.map(() => []);
    return normalizedIds.map((_, i) => {
      const list = jobsData[i]?.job_data?.eval_results;
      return Array.isArray(list) ? list : [];
    });
  }, [jobsData, normalizedIds]);

  const safeFileIndices = normalizedIds.map((id, i) => {
    const f = fileIndexByJob[id] ?? 0;
    const len = evalFilesByIndex[i]?.length ?? 0;
    return f >= 0 && f < len ? f : 0;
  });

  const allHaveFiles =
    evalFilesByIndex.length === normalizedIds.length &&
    evalFilesByIndex.every((files) => files.length > 0);

  const reportsKey =
    open && experimentId && hasEnoughJobs && allHaveFiles
      ? [
          'compare-reports',
          experimentId,
          normalizedIds.join(','),
          safeFileIndices.join(','),
        ]
      : null;

  const {
    data: reportsData,
    isLoading: isLoadingReports,
    error: reportsError,
  } = useSWR<JobReport[]>(reportsKey, async () => {
    const responses = await Promise.all(
      normalizedIds.map((id, i) =>
        fetchJson(
          chatAPI.Endpoints.Experiment.GetEvalResults(
            experimentId as any,
            id,
            'view',
            safeFileIndices[i],
          ),
        ),
      ),
    );
    return responses.map((r) => ({
      header: Array.isArray(r?.header) ? (r.header as string[]) : [],
      body: Array.isArray(r?.body) ? (r.body as unknown[][]) : [],
    }));
  });

  const reports: JobReport[] = useMemo(() => {
    if (
      Array.isArray(reportsData) &&
      reportsData.length === normalizedIds.length
    )
      return reportsData;
    return normalizedIds.map(() => EMPTY_REPORT);
  }, [reportsData, normalizedIds]);

  const isLoading = isLoadingJobs || isLoadingReports;
  const anyError = Boolean(jobsError || reportsError);
  const anyEmptyFiles =
    !isLoading &&
    Array.isArray(jobsData) &&
    evalFilesByIndex.some((files) => files.length === 0);

  const firstHeader = reports[0]?.header ?? [];
  const headersMatch =
    firstHeader.length > 0 &&
    reports.every(
      (r) =>
        r.header.length === firstHeader.length &&
        r.header.every((col, idx) => col === firstHeader[idx]),
    );

  const header = headersMatch ? firstHeader : [];
  const scoreColumnIndex = header.findIndex(
    (col: string) => col.toLowerCase() === 'score',
  );

  const headerKey = header.join(',');
  useEffect(() => {
    setChartCategoryCol(0);
    setChartValueCols(
      header.length > 0 && scoreColumnIndex >= 0 ? [scoreColumnIndex] : [],
    );
  }, [headerKey, scoreColumnIndex, header.length]);

  let error: string | null = null;
  if (!hasEnoughJobs) {
    error = 'Select at least two jobs to compare evaluation results.';
  } else if (anyError) {
    error = 'Failed to load evaluation results for one or more jobs.';
  } else if (anyEmptyFiles) {
    error = 'No evaluation results found for one or more jobs.';
  } else if (
    reports.every((r) => r.header.length > 0) &&
    !headersMatch &&
    !isLoading
  ) {
    error =
      'Cannot compare these evaluation files because their columns differ.';
  }

  const effectiveValueCols =
    chartValueCols.length > 0
      ? chartValueCols
      : scoreColumnIndex >= 0
        ? [scoreColumnIndex]
        : [];

  const chartMetrics: ChartMetric[] = useMemo(() => {
    if (!headersMatch) return [];
    const headerRow = header;
    if (
      headerRow.length === 0 ||
      effectiveValueCols.length === 0 ||
      chartCategoryCol < 0 ||
      chartCategoryCol >= headerRow.length
    ) {
      return [];
    }

    const safeValueCols = effectiveValueCols.filter(
      (idx) => idx >= 0 && idx < headerRow.length,
    );
    if (safeValueCols.length === 0) return [];

    const valueColNames = safeValueCols.map(
      (idx) => headerRow[idx] ?? `col_${idx}`,
    );

    const aggregator = new Map<
      string,
      { type: string; series: string; sum: number; count: number }
    >();

    normalizedIds.forEach((jobId, jobIdx) => {
      const body = reports[jobIdx]?.body ?? [];
      if (body.length === 0) return;
      const label = `Job ${jobId}`;
      body.forEach((row: unknown[]) => {
        const type = String(row[chartCategoryCol] ?? '');
        safeValueCols.forEach((valueColIdx, k) => {
          const valueName = valueColNames[k];
          const score = parseFloat(String(row[valueColIdx] ?? 0)) || 0;
          const series = `${label} · ${valueName}`;
          const key = `${type}|||${series}`;
          const existing = aggregator.get(key);
          if (existing) {
            existing.sum += score;
            existing.count += 1;
          } else {
            aggregator.set(key, { type, series, sum: score, count: 1 });
          }
        });
      });
    });

    return Array.from(aggregator.values()).map((entry) => {
      const mean = entry.sum / entry.count;
      const rounded = Number.isFinite(mean)
        ? Number(mean.toFixed(2))
        : mean || 0;
      return {
        type: entry.type,
        series: entry.series,
        score: rounded,
      };
    });
  }, [
    headersMatch,
    header,
    reports,
    effectiveValueCols,
    chartCategoryCol,
    normalizedIds,
  ]);

  const needsFieldMapping =
    !error &&
    headersMatch &&
    scoreColumnIndex === -1 &&
    chartValueCols.length === 0;

  const canShowChart =
    !error &&
    headersMatch &&
    chartMetrics.length > 0 &&
    effectiveValueCols.length > 0;

  const getFileName = (filePath: string, index: number) => {
    const filename = filePath.split('/').pop() || `File ${index + 1}`;
    return filename;
  };

  const shortenJobId = (id: string) => {
    const s = String(id);
    return s.length > 8 ? `${s.slice(0, 8)}…` : s;
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ width: '90vw', height: '90vh', pt: 5, overflow: 'auto' }}
      >
        <ModalClose />
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Typography level="h4">
            Comparing {normalizedIds.length} jobs
          </Typography>

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            {normalizedIds.map((jobId, idx) => {
              const evalFiles = evalFilesByIndex[idx] ?? [];
              const fileIndex = fileIndexByJob[jobId] ?? 0;
              return (
                <FormControl key={jobId} sx={{ minWidth: 220 }}>
                  <FormLabel title={`Job ${jobId} eval file`}>
                    Job {shortenJobId(jobId)} eval file
                  </FormLabel>
                  <Select
                    value={fileIndex}
                    onChange={(_, value) => {
                      if (value !== null) {
                        setFileIndexByJob((prev) => ({
                          ...prev,
                          [jobId]: value as number,
                        }));
                      }
                    }}
                    disabled={evalFiles.length === 0}
                  >
                    {evalFiles.map((filePath: string, fIdx: number) => (
                      <Option key={getFileName(filePath, fIdx)} value={fIdx}>
                        {getFileName(filePath, fIdx)}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              );
            })}
          </Stack>
        </Stack>

        {isLoading ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              gap: 2,
            }}
          >
            <CircularProgress size="lg" />
            <Typography level="body-lg">
              Loading evaluation results for {normalizedIds.length} jobs…
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="danger">{error}</Typography>
          </Box>
        ) : (
          <>
            {headersMatch && (
              <Stack spacing={2} sx={{ mb: 2 }}>
                {needsFieldMapping && (
                  <Alert color="neutral" variant="soft">
                    These files don&apos;t have a column named
                    &quot;score&quot;. Choose which column is the category (e.g.
                    metric name) and which columns are the values to chart.
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <FormControl sx={{ minWidth: 200 }}>
                    <FormLabel>Category (x-axis / metric name)</FormLabel>
                    <Select
                      value={chartCategoryCol}
                      onChange={(_, v) => {
                        if (v !== null) setChartCategoryCol(v as number);
                      }}
                    >
                      {header.map((col: string, idx: number) => (
                        <Option key={`cat-${col}`} value={idx}>
                          {formatColumnNames(col)}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 200 }}>
                    <FormLabel>Value column(s)</FormLabel>
                    <Select
                      multiple
                      value={chartValueCols}
                      onChange={(_, v) => {
                        setChartValueCols((v as number[]) ?? []);
                      }}
                    >
                      {header.map((col: string, idx: number) => {
                        const selected = chartValueCols.includes(idx);
                        return (
                          <Option key={`val-${col}`} value={idx}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                              }}
                            >
                              {selected && <CheckIcon size={14} />}
                              <span>{formatColumnNames(col)}</span>
                            </Box>
                          </Option>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Box>
              </Stack>
            )}
            {canShowChart && (
              <Box sx={{ minHeight: 420 }}>
                <Chart metrics={chartMetrics} compareChart={false} />
              </Box>
            )}
            {!canShowChart && !error && headersMatch && (
              <Typography level="body-md" color="neutral">
                No data to chart. Add at least one row and select at least one
                value column.
              </Typography>
            )}
          </>
        )}
      </ModalDialog>
    </Modal>
  );
};

export default CompareEvalResultsModal;
