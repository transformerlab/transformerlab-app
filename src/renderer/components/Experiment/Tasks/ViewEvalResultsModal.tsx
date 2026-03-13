import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  ModalClose,
  ModalDialog,
  Table,
  Button,
  Select,
  Option,
  FormControl,
  FormLabel,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/joy';
import { TableIcon, BarChart3, CheckIcon } from 'lucide-react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import Chart, { type ChartMetric } from './Chart';

function formatColumnNames(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1') // Convert Camel Case to spaced
    .replace(/^./, (str: string) => str.toUpperCase()) // Capitalize first letter
    .replace(/_/g, ' '); // Replace underscores with spaces
}

function heatedColor(value: number): string {
  const h = value * 240;
  return `hsla(${h}, 100%, 50%, 0.3)`;
}

function formatScore(score: unknown): number | string {
  if (typeof score === 'number') return score;
  if (typeof score === 'string') {
    const parsed = parseFloat(score);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return String(score);
}

const ViewEvalResultsModal = ({
  open,
  onClose,
  jobId,
}: {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}) => {
  const { experimentInfo } = useExperimentInfo();
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  // Chart field mapping: when header has no "score" column, user picks which column is value/category
  const [chartCategoryCol, setChartCategoryCol] = useState<number>(0);
  const [chartValueCols, setChartValueCols] = useState<number[]>([]);

  // Fetch job data to get list of eval results files
  const {
    data: jobData,
    isError: jobError,
    isLoading: isLoadingJob,
  } = useSWR(
    open && jobId && experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, String(jobId))
      : null,
    fetcher,
  );

  // Extract eval results files from job data
  const evalResultsFiles =
    jobData?.job_data?.eval_results &&
    Array.isArray(jobData.job_data.eval_results)
      ? jobData.job_data.eval_results
      : [];

  // Reset selected file index and view mode when modal opens or files change
  useEffect(() => {
    if (open && evalResultsFiles.length > 0) {
      setSelectedFileIndex(0);
      setViewMode('table');
    }
  }, [open, evalResultsFiles.length]);

  // Fetch the selected eval results file
  const {
    data: reportData,
    isError: reportError,
    isLoading: isLoadingReport,
  } = useSWR(
    open &&
      jobId &&
      experimentInfo?.id &&
      evalResultsFiles.length > 0 &&
      selectedFileIndex >= 0 &&
      selectedFileIndex < evalResultsFiles.length
      ? chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          String(jobId),
          'view',
          selectedFileIndex,
        )
      : null,
    fetcher,
  );

  // Process report data (memoized for stable useMemo dependency)
  const report = useMemo(
    () =>
      reportData?.header && reportData?.body
        ? { header: reportData.header, body: reportData.body }
        : { header: [], body: [] },
    [reportData?.header, reportData?.body],
  );

  const { header: reportHeader } = report;
  const scoreColumnIndex = reportHeader.findIndex(
    (col: string) => col.toLowerCase() === 'score',
  );

  useEffect(() => {
    setChartCategoryCol(0);
    setChartValueCols(scoreColumnIndex >= 0 ? [scoreColumnIndex] : []);
  }, [selectedFileIndex, scoreColumnIndex]);

  // Determine loading and error states
  const isLoading = isLoadingJob || isLoadingReport;
  let error: string | null = null;
  if (jobError || reportError) {
    error = 'Failed to load evaluation results';
  } else if (evalResultsFiles.length === 0 && !isLoadingJob) {
    error = 'No evaluation results found';
  } else if (reportData && (!reportData.header || !reportData.body)) {
    error = 'Invalid data format';
  }

  const handleDownload = async () => {
    if (!experimentInfo?.id || !jobId) return;

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          String(jobId),
          'download',
          selectedFileIndex,
        ),
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      // Extract filename from the file path
      const filePath = evalResultsFiles[selectedFileIndex] || '';
      const filename = filePath.split('/').pop() || `eval_results_${jobId}.csv`;
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error downloading eval results:', err);
    }
  };

  // Get display name for file selector
  const getFileName = (filePath: string, index: number) => {
    const filename = filePath.split('/').pop() || `File ${index + 1}`;
    return filename;
  };

  const effectiveValueCols =
    chartValueCols.length > 0
      ? chartValueCols
      : scoreColumnIndex >= 0
        ? [scoreColumnIndex]
        : [];

  const chartMetrics: ChartMetric[] = useMemo(() => {
    const { header, body } = report;
    if (
      body.length === 0 ||
      header.length === 0 ||
      effectiveValueCols.length === 0 ||
      chartCategoryCol < 0 ||
      chartCategoryCol >= header.length
    ) {
      return [];
    }
    const safeValueCols = effectiveValueCols.filter(
      (idx) => idx >= 0 && idx < header.length,
    );
    if (safeValueCols.length === 0) return [];

    const valueColNames = safeValueCols.map(
      (idx) => header[idx] ?? `col_${idx}`,
    );

    const aggregator = new Map<
      string,
      { type: string; series: string; sum: number; count: number }
    >();

    body.forEach((row: unknown[]) => {
      const type = String(row[chartCategoryCol] ?? '');

      safeValueCols.forEach((valueColIdx, k) => {
        const valueName = valueColNames[k];
        const score = parseFloat(String(row[valueColIdx] ?? 0)) || 0;
        const series = valueName;
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
  }, [report, effectiveValueCols, chartCategoryCol]);

  const needsFieldMapping =
    viewMode === 'chart' &&
    scoreColumnIndex === -1 &&
    chartValueCols.length === 0;
  const canShowChart =
    viewMode === 'chart' &&
    chartMetrics.length > 0 &&
    effectiveValueCols.length > 0;

  const renderBody = () => {
    if (isLoading) {
      return (
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
          <Typography level="body-lg">Loading evaluation results...</Typography>
        </Box>
      );
    }
    if (error) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="danger">{error}</Typography>
        </Box>
      );
    }
    if (viewMode === 'table') {
      return (
        <Box sx={{ overflow: 'auto' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                {report?.header &&
                  report?.header.map((col: string) => (
                    <th key={col}>{formatColumnNames(col)}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {report?.body?.map((row: any[], i: number) => (
                <tr key={`eval-row-${String(i)}-${row[0] ?? ''}`}>
                  {row.map((col: any, j: number) => (
                    <td key={report?.header?.[j] ?? `col-${j}`}>
                      {scoreColumnIndex !== -1 && j === scoreColumnIndex ? (
                        <div
                          style={{
                            backgroundColor: heatedColor(
                              parseFloat(String(formatScore(col))) || 0,
                            ),
                            height: '100%',
                            width: '100%',
                            overflow: 'hidden',
                            padding: '0 5px',
                            fontWeight: 'bold',
                          }}
                        >
                          {formatScore(col)}
                        </div>
                      ) : (
                        <div
                          style={{
                            height: '100%',
                            padding: '0 5px',
                            maxHeight: '100px',
                            overflow: 'auto',
                          }}
                        >
                          {col}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
      );
    }
    return (
      <>
        {viewMode === 'chart' && (
          <Stack spacing={2} sx={{ mb: 2 }}>
            {needsFieldMapping && (
              <Alert color="neutral" variant="soft">
                This file doesn&apos;t have a column named &quot;score&quot;.
                Choose which column is the category (e.g. metric name) and which
                is the value to chart.
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
                  {reportHeader.map((col: string, idx: number) => (
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
                  {reportHeader.map((col: string, idx: number) => {
                    const selected = chartValueCols.includes(idx);
                    return (
                      <Option key={`val-${col}`} value={idx}>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
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
        {viewMode === 'chart' && !canShowChart && !needsFieldMapping && (
          <Typography level="body-md" color="neutral">
            No data to chart. Add at least one row and select a value column.
          </Typography>
        )}
      </>
    );
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 5 }}>
        <ModalClose />
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography level="h4">
              Evaluation Results from Job: {jobId}
            </Typography>
            <Button onClick={handleDownload} variant="outlined">
              Download Report
            </Button>
          </Box>
          {evalResultsFiles.length > 1 && (
            <FormControl>
              <FormLabel>Select Evaluation Results File</FormLabel>
              <Select
                value={selectedFileIndex}
                onChange={(_, value) => {
                  if (value !== null) {
                    setSelectedFileIndex(value as number);
                  }
                }}
              >
                {evalResultsFiles.map((filePath: string, index: number) => (
                  <Option key={getFileName(filePath, index)} value={index}>
                    {getFileName(filePath, index)}
                  </Option>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ display: 'flex', gap: 0 }}>
            <Button
              variant={viewMode === 'table' ? 'soft' : 'outlined'}
              onClick={() => setViewMode('table')}
              sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              <TableIcon size={18} style={{ marginRight: 6 }} />
              Table
            </Button>
            <Button
              variant={viewMode === 'chart' ? 'soft' : 'outlined'}
              onClick={() => setViewMode('chart')}
              sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              <BarChart3 size={18} style={{ marginRight: 6 }} />
              Chart
            </Button>
          </Box>
        </Stack>
        {renderBody()}
      </ModalDialog>
    </Modal>
  );
};

export default ViewEvalResultsModal;
