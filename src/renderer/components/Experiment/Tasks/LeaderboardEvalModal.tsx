import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormLabel,
  IconButton,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Sheet,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { ArrowUpDown, Download, Eye } from 'lucide-react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import Chart, { type ChartMetric } from './Chart';
import ViewEvalResultsModal from './ViewEvalResultsModal';
import {
  buildCategoryBreakdown,
  buildLeaderboard,
  toCsv,
  toMarkdownReport,
  type EvalReport,
  type JobReport,
} from './evalAggregate';

export interface LeaderboardJobSelection {
  id: string;
  title: string;
}

interface LeaderboardEvalModalProps {
  open: boolean;
  onClose: () => void;
  jobs: LeaderboardJobSelection[];
}

interface JobLoadState {
  files: string[];
  fileIndex: number;
  report: EvalReport | null;
  loading: boolean;
  error: string | null;
}

function heatedColor(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || max <= min) return 'transparent';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const h = t * 120;
  return `hsla(${h}, 70%, 50%, 0.25)`;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function JobReportLoader({
  jobId,
  fileIndex,
  onMeta,
  onReport,
}: {
  jobId: string;
  fileIndex: number;
  onMeta: (jobId: string, files: string[], error: string | null) => void;
  onReport: (
    jobId: string,
    report: EvalReport | null,
    loading: boolean,
    error: string | null,
  ) => void;
}) {
  const { experimentInfo } = useExperimentInfo();

  const {
    data: jobData,
    isError: jobError,
    isLoading: isLoadingJob,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, jobId)
      : null,
    fetcher,
  );

  const files: string[] = useMemo(() => {
    const raw = jobData?.job_data?.eval_results;
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [jobData]);

  useEffect(() => {
    onMeta(jobId, files, jobError ? 'Failed to load job' : null);
  }, [jobId, files, jobError, onMeta]);

  const fetchKey =
    experimentInfo?.id &&
    files.length > 0 &&
    fileIndex >= 0 &&
    fileIndex < files.length
      ? chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          jobId,
          'view',
          fileIndex,
        )
      : null;

  const {
    data: reportData,
    isError: reportError,
    isLoading: isLoadingReport,
  } = useSWR(fetchKey, fetcher);

  useEffect(() => {
    const loading = isLoadingJob || isLoadingReport;
    if (loading) {
      onReport(jobId, null, true, null);
      return;
    }
    if (reportError) {
      onReport(jobId, null, false, 'Failed to load eval results');
      return;
    }
    if (reportData?.header && reportData?.body) {
      onReport(
        jobId,
        {
          header: reportData.header as string[],
          body: reportData.body as unknown[][],
        },
        false,
        null,
      );
      return;
    }
    if (files.length === 0 && !isLoadingJob) {
      onReport(jobId, null, false, 'No eval files');
      return;
    }
    onReport(jobId, null, false, null);
  }, [
    jobId,
    isLoadingJob,
    isLoadingReport,
    reportError,
    reportData,
    files.length,
    onReport,
  ]);

  return null;
}

type SortDir = 'asc' | 'desc' | null;

export default function LeaderboardEvalModal({
  open,
  onClose,
  jobs,
}: LeaderboardEvalModalProps) {
  const [states, setStates] = useState<Record<string, JobLoadState>>({});
  const [showFileMapping, setShowFileMapping] = useState(false);
  const [sortMetric, setSortMetric] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);
  const [inspectJobId, setInspectJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStates((prev) => {
      const next: Record<string, JobLoadState> = {};
      jobs.forEach((j) => {
        next[j.id] = prev[j.id] ?? {
          files: [],
          fileIndex: 0,
          report: null,
          loading: true,
          error: null,
        };
      });
      return next;
    });
  }, [open, jobs]);

  const handleMeta = useCallback(
    (jobId: string, files: string[], error: string | null) => {
      setStates((prev) => {
        const existing = prev[jobId];
        if (!existing) return prev;
        if (
          existing.files.length === files.length &&
          existing.files.every((f, i) => f === files[i]) &&
          existing.error === error
        ) {
          return prev;
        }
        return {
          ...prev,
          [jobId]: {
            ...existing,
            files,
            fileIndex:
              existing.fileIndex < files.length ? existing.fileIndex : 0,
            error,
          },
        };
      });
    },
    [],
  );

  const handleReport = useCallback(
    (
      jobId: string,
      report: EvalReport | null,
      loading: boolean,
      error: string | null,
    ) => {
      setStates((prev) => {
        const existing = prev[jobId];
        if (!existing) return prev;
        if (
          existing.report === report &&
          existing.loading === loading &&
          existing.error === (error ?? existing.error)
        ) {
          return prev;
        }
        return {
          ...prev,
          [jobId]: {
            ...existing,
            report,
            loading,
            error: error ?? existing.error,
          },
        };
      });
    },
    [],
  );

  const jobReports: JobReport[] = useMemo(
    () =>
      jobs
        .map((j) => ({
          jobId: j.id,
          jobTitle: j.title,
          report: states[j.id]?.report ?? { header: [], body: [] },
        }))
        .filter((j) => j.report.header.length > 0),
    [jobs, states],
  );

  const leaderboard = useMemo(() => buildLeaderboard(jobReports), [jobReports]);

  const sortedRows = useMemo(() => {
    const rows = [...leaderboard.rows];
    if (!sortMetric || !sortDir) {
      rows.sort((a, b) => b.wins - a.wins);
      return rows;
    }
    rows.sort((a, b) => {
      const av = a.cells[sortMetric]?.mean ?? -Infinity;
      const bv = b.cells[sortMetric]?.mean ?? -Infinity;
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [leaderboard.rows, sortMetric, sortDir]);

  const minMaxByMetric = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    leaderboard.metricColumns.forEach((m) => {
      let min = Infinity;
      let max = -Infinity;
      leaderboard.rows.forEach((r) => {
        const v = r.cells[m]?.mean;
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      });
      map.set(m, { min, max });
    });
    return map;
  }, [leaderboard]);

  useEffect(() => {
    if (
      drilldownMetric &&
      !leaderboard.metricColumns.includes(drilldownMetric)
    ) {
      setDrilldownMetric(null);
    }
  }, [drilldownMetric, leaderboard.metricColumns]);

  const handleSortClick = (metric: string) => {
    if (sortMetric !== metric) {
      setSortMetric(metric);
      setSortDir('desc');
      return;
    }
    if (sortDir === 'desc') setSortDir('asc');
    else if (sortDir === 'asc') {
      setSortMetric(null);
      setSortDir(null);
    } else setSortDir('desc');
  };

  const drilldownChartMetrics: ChartMetric[] = useMemo(() => {
    if (!drilldownMetric || !leaderboard.categoryColumn) return [];
    const rows = buildCategoryBreakdown(
      jobReports,
      drilldownMetric,
      leaderboard.categoryColumn,
    );
    const out: ChartMetric[] = [];
    rows.forEach((row) => {
      Object.entries(row.cells).forEach(([jobId, cell]) => {
        const title = jobs.find((j) => j.id === jobId)?.title ?? jobId;
        if (Number.isFinite(cell.mean)) {
          out.push({
            type: row.category,
            series: title,
            score: Number(cell.mean.toFixed(3)),
          });
        }
      });
    });
    return out;
  }, [drilldownMetric, jobReports, leaderboard.categoryColumn, jobs]);

  const anyLoading = jobs.some((j) => states[j.id]?.loading);
  const allFailed =
    jobs.length > 0 &&
    jobs.every(
      (j) => states[j.id]?.error != null && states[j.id]?.report === null,
    );

  const handleExportMarkdown = () => {
    const breakdowns = leaderboard.categoryColumn
      ? leaderboard.metricColumns.map((m) => ({
          metric: m,
          rows: buildCategoryBreakdown(
            jobReports,
            m,
            leaderboard.categoryColumn!,
          ),
        }))
      : [];
    const lookup: Record<string, string> = {};
    jobs.forEach((j) => {
      lookup[j.id] = j.title;
    });
    const md = toMarkdownReport(leaderboard, breakdowns, lookup);
    downloadBlob('leaderboard.md', md, 'text/markdown');
  };

  const handleExportCsv = () => {
    downloadBlob('leaderboard.csv', toCsv(leaderboard), 'text/csv');
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalDialog
          sx={{ width: '95vw', height: '92vh', pt: 5, overflow: 'auto' }}
        >
          <ModalClose />
          {open &&
            jobs.map((j) => (
              <JobReportLoader
                key={`loader-${j.id}-${states[j.id]?.fileIndex ?? 0}`}
                jobId={j.id}
                fileIndex={states[j.id]?.fileIndex ?? 0}
                onMeta={handleMeta}
                onReport={handleReport}
              />
            ))}
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography level="h4">
                Eval Leaderboard ({jobs.length} jobs)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() => setShowFileMapping((v) => !v)}
                >
                  {showFileMapping ? 'Hide' : 'Configure'} file mapping
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  startDecorator={<Download size={14} />}
                  onClick={handleExportCsv}
                  disabled={leaderboard.rows.length === 0}
                >
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  startDecorator={<Download size={14} />}
                  onClick={handleExportMarkdown}
                  disabled={leaderboard.rows.length === 0}
                >
                  Markdown report
                </Button>
              </Stack>
            </Box>

            {showFileMapping && (
              <Sheet variant="soft" sx={{ p: 2, borderRadius: 'sm' }}>
                <Typography level="title-sm" sx={{ mb: 1 }}>
                  Per-job eval file
                </Typography>
                <Stack spacing={1}>
                  {jobs.map((j) => {
                    const s = states[j.id];
                    return (
                      <Box
                        key={`fm-${j.id}`}
                        sx={{
                          display: 'flex',
                          gap: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Typography level="body-sm" sx={{ minWidth: 200 }}>
                          {j.title}
                        </Typography>
                        <FormControl sx={{ flex: 1 }}>
                          <Select
                            size="sm"
                            value={s?.fileIndex ?? 0}
                            onChange={(_, v) => {
                              if (v === null) return;
                              setStates((prev) => ({
                                ...prev,
                                [j.id]: {
                                  ...(prev[j.id] ?? {
                                    files: [],
                                    fileIndex: 0,
                                    report: null,
                                    loading: true,
                                    error: null,
                                  }),
                                  fileIndex: v as number,
                                },
                              }));
                            }}
                            disabled={!s || s.files.length === 0}
                          >
                            {(s?.files ?? []).map((f, idx) => (
                              <Option key={`${j.id}-f-${idx}`} value={idx}>
                                {f.split('/').pop() || `File ${idx + 1}`}
                              </Option>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    );
                  })}
                </Stack>
              </Sheet>
            )}

            {leaderboard.droppedColumns.length > 0 && (
              <Alert color="neutral" variant="soft">
                Columns not present in every job were dropped:{' '}
                <strong>{leaderboard.droppedColumns.join(', ')}</strong>
              </Alert>
            )}
            {leaderboard.metricColumns.length === 0 &&
              !anyLoading &&
              jobReports.length > 0 && (
                <Alert color="warning" variant="soft">
                  No shared numeric metric columns were found across the
                  selected jobs.
                </Alert>
              )}
            {allFailed && (
              <Alert color="danger" variant="soft">
                Could not load eval results for any of the selected jobs.
              </Alert>
            )}
          </Stack>

          {anyLoading && jobReports.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 6,
                gap: 2,
              }}
            >
              <CircularProgress size="lg" />
              <Typography>Loading eval reports…</Typography>
            </Box>
          ) : (
            <Box sx={{ overflow: 'auto' }}>
              <Table stickyHeader hoverRow>
                <thead>
                  <tr>
                    <th style={{ width: 32 }} aria-label="actions" />
                    <th>Model</th>
                    {leaderboard.metricColumns.map((m) => (
                      <th key={`h-${m}`}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            cursor: 'pointer',
                          }}
                          onClick={() => handleSortClick(m)}
                        >
                          {m}
                          <ArrowUpDown size={12} />
                          {sortMetric === m && sortDir && (
                            <Typography level="body-xs">
                              {sortDir === 'asc' ? '▲' : '▼'}
                            </Typography>
                          )}
                        </Box>
                      </th>
                    ))}
                    <th style={{ width: 60 }}>Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={`r-${row.jobId}`}>
                      <td>
                        <Tooltip title="Open single-job view">
                          <IconButton
                            size="sm"
                            variant="plain"
                            onClick={() => setInspectJobId(row.jobId)}
                          >
                            <Eye size={14} />
                          </IconButton>
                        </Tooltip>
                      </td>
                      <td>
                        <Typography level="body-sm">{row.jobTitle}</Typography>
                        <Typography level="body-xs" color="neutral">
                          {row.jobId}
                        </Typography>
                      </td>
                      {leaderboard.metricColumns.map((m) => {
                        const cell = row.cells[m];
                        const range = minMaxByMetric.get(m);
                        const bg =
                          range && cell && Number.isFinite(cell.mean)
                            ? heatedColor(cell.mean, range.min, range.max)
                            : 'transparent';
                        const isMax =
                          range &&
                          cell &&
                          cell.mean === range.max &&
                          range.max > range.min;
                        return (
                          <td
                            key={`c-${row.jobId}-${m}`}
                            style={{ backgroundColor: bg }}
                          >
                            {cell && Number.isFinite(cell.mean) ? (
                              <Box
                                sx={{
                                  cursor: 'pointer',
                                  fontWeight: isMax ? 700 : 400,
                                }}
                                onClick={() => setDrilldownMetric(m)}
                              >
                                {cell.mean.toFixed(3)}
                                {cell.stddev > 0 && (
                                  <Typography
                                    level="body-xs"
                                    color="neutral"
                                    sx={{ ml: 0.5 }}
                                  >
                                    ±{cell.stddev.toFixed(2)}
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography level="body-xs" color="neutral">
                                —
                              </Typography>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{ fontWeight: row.wins > 0 ? 700 : 400 }}
                        >
                          {row.wins}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          )}

          {drilldownMetric && drilldownChartMetrics.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography level="title-md">
                  Per-{leaderboard.categoryColumn ?? 'category'} breakdown:{' '}
                  {drilldownMetric}
                </Typography>
                <Button
                  size="sm"
                  variant="plain"
                  onClick={() => setDrilldownMetric(null)}
                >
                  Hide
                </Button>
              </Box>
              <Box sx={{ minHeight: 360 }}>
                <Chart metrics={drilldownChartMetrics} compareChart={false} />
              </Box>
            </Box>
          )}
        </ModalDialog>
      </Modal>

      <ViewEvalResultsModal
        open={inspectJobId !== null}
        onClose={() => setInspectJobId(null)}
        jobId={inspectJobId}
      />
    </>
  );
}
