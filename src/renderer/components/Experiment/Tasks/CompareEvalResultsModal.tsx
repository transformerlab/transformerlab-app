import React, { useEffect, useMemo, useState } from 'react';
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
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import Chart, { type ChartMetric } from '../Eval/Chart';

function formatColumnNames(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str: string) => str.toUpperCase())
    .replace(/_/g, ' ');
}

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
  const [selectedFileIndexA, setSelectedFileIndexA] = useState(0);
  const [selectedFileIndexB, setSelectedFileIndexB] = useState(0);
  const [chartCategoryCol, setChartCategoryCol] = useState<number>(0);
  const [chartValueCols, setChartValueCols] = useState<number[]>([]);

  const jobIdA = jobIds[0];
  const jobIdB = jobIds[1];

  const hasTwoJobs =
    jobIds.length === 2 && jobIdA !== undefined && jobIdB !== undefined;

  const {
    data: jobAData,
    isError: jobAError,
    isLoading: isLoadingJobA,
  } = useSWR(
    open && hasTwoJobs && experimentInfo?.id && jobIdA
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, String(jobIdA))
      : null,
    fetcher,
  );

  const {
    data: jobBData,
    isError: jobBError,
    isLoading: isLoadingJobB,
  } = useSWR(
    open && hasTwoJobs && experimentInfo?.id && jobIdB
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, String(jobIdB))
      : null,
    fetcher,
  );

  const evalResultsFilesA =
    jobAData?.job_data?.eval_results &&
    Array.isArray(jobAData.job_data.eval_results)
      ? jobAData.job_data.eval_results
      : [];

  const evalResultsFilesB =
    jobBData?.job_data?.eval_results &&
    Array.isArray(jobBData.job_data.eval_results)
      ? jobBData.job_data.eval_results
      : [];

  useEffect(() => {
    if (open && evalResultsFilesA.length > 0) {
      setSelectedFileIndexA(0);
    }
  }, [open, evalResultsFilesA.length]);

  useEffect(() => {
    if (open && evalResultsFilesB.length > 0) {
      setSelectedFileIndexB(0);
    }
  }, [open, evalResultsFilesB.length]);

  const {
    data: reportDataA,
    isError: reportAError,
    isLoading: isLoadingReportA,
  } = useSWR(
    open &&
      hasTwoJobs &&
      experimentInfo?.id &&
      jobIdA &&
      evalResultsFilesA.length > 0 &&
      selectedFileIndexA >= 0 &&
      selectedFileIndexA < evalResultsFilesA.length
      ? chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          String(jobIdA),
          'view',
          selectedFileIndexA,
        )
      : null,
    fetcher,
  );

  const {
    data: reportDataB,
    isError: reportBError,
    isLoading: isLoadingReportB,
  } = useSWR(
    open &&
      hasTwoJobs &&
      experimentInfo?.id &&
      jobIdB &&
      evalResultsFilesB.length > 0 &&
      selectedFileIndexB >= 0 &&
      selectedFileIndexB < evalResultsFilesB.length
      ? chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          String(jobIdB),
          'view',
          selectedFileIndexB,
        )
      : null,
    fetcher,
  );

  const reportA = useMemo(
    () =>
      reportDataA?.header && reportDataA?.body
        ? {
            header: reportDataA.header as string[],
            body: reportDataA.body as unknown[][],
          }
        : { header: [] as string[], body: [] as unknown[][] },
    [reportDataA?.header, reportDataA?.body],
  );

  const reportB = useMemo(
    () =>
      reportDataB?.header && reportDataB?.body
        ? {
            header: reportDataB.header as string[],
            body: reportDataB.body as unknown[][],
          }
        : { header: [] as string[], body: [] as unknown[][] },
    [reportDataB?.header, reportDataB?.body],
  );

  const headersMatch =
    reportA.header.length > 0 &&
    reportA.header.length === reportB.header.length &&
    reportA.header.every((col, idx) => col === reportB.header[idx]);

  const header = headersMatch ? reportA.header : [];

  const scoreColumnIndex = header.findIndex(
    (col: string) => col.toLowerCase() === 'score',
  );

  useEffect(() => {
    if (header.length > 0) {
      setChartCategoryCol(0);
      setChartValueCols(scoreColumnIndex >= 0 ? [scoreColumnIndex] : []);
    } else {
      setChartCategoryCol(0);
      setChartValueCols([]);
    }
  }, [header.join(','), scoreColumnIndex]);

  const isLoading =
    isLoadingJobA || isLoadingJobB || isLoadingReportA || isLoadingReportB;

  let error: string | null = null;
  if (!hasTwoJobs) {
    error = 'Select two jobs to compare evaluation results.';
  } else if (jobAError || jobBError || reportAError || reportBError) {
    error = 'Failed to load evaluation results for one or both jobs.';
  } else if (
    (evalResultsFilesA.length === 0 || evalResultsFilesB.length === 0) &&
    !isLoadingJobA &&
    !isLoadingJobB
  ) {
    error = 'No evaluation results found for one or both jobs.';
  } else if (reportA.header.length && reportB.header.length && !headersMatch) {
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
    const bodyA = reportA.body;
    const bodyB = reportB.body;

    if (
      bodyA.length === 0 ||
      bodyB.length === 0 ||
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

    const jobs = [
      { label: `Job ${jobIdA}`, body: bodyA },
      { label: `Job ${jobIdB}`, body: bodyB },
    ];

    jobs.forEach((job) => {
      job.body.forEach((row: unknown[]) => {
        const type = String(row[chartCategoryCol] ?? '');

        safeValueCols.forEach((valueColIdx, k) => {
          const valueName = valueColNames[k];
          const score = parseFloat(String(row[valueColIdx] ?? 0)) || 0;
          const series = `${job.label} · ${valueName}`;
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
    reportA.body,
    reportB.body,
    effectiveValueCols,
    chartCategoryCol,
    jobIdA,
    jobIdB,
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

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 5 }}>
        <ModalClose />
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Typography level="h4">
            Compare Evaluation Results: Job {jobIdA} vs Job {jobIdB}
          </Typography>

          <Stack direction="row" spacing={2}>
            <FormControl sx={{ minWidth: 220 }}>
              <FormLabel>Job {jobIdA} eval file</FormLabel>
              <Select
                value={selectedFileIndexA}
                onChange={(_, value) => {
                  if (value !== null) {
                    setSelectedFileIndexA(value as number);
                  }
                }}
                disabled={evalResultsFilesA.length === 0}
              >
                {evalResultsFilesA.map((filePath: string, index: number) => (
                  <Option key={getFileName(filePath, index)} value={index}>
                    {getFileName(filePath, index)}
                  </Option>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 220 }}>
              <FormLabel>Job {jobIdB} eval file</FormLabel>
              <Select
                value={selectedFileIndexB}
                onChange={(_, value) => {
                  if (value !== null) {
                    setSelectedFileIndexB(value as number);
                  }
                }}
                disabled={evalResultsFilesB.length === 0}
              >
                {evalResultsFilesB.map((filePath: string, index: number) => (
                  <Option key={getFileName(filePath, index)} value={index}>
                    {getFileName(filePath, index)}
                  </Option>
                ))}
              </Select>
            </FormControl>
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
              Loading evaluation results for both jobs...
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
