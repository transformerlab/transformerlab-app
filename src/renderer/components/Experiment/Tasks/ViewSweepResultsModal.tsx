import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import {
  Box,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Table,
  Sheet,
  Chip,
  Stack,
  CircularProgress,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

interface ViewSweepResultsModalProps {
  jobId: number;
  setJobId: (jobId: number) => void;
}

export default function ViewSweepResultsModal({
  jobId,
  setJobId,
}: ViewSweepResultsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Always call hooks at the top level - conditionally enable the query instead
  const { data, error, isLoading } = useSWR(
    jobId !== -1 && experimentInfo
      ? chatAPI.Endpoints.ComputeProvider.GetSweepResults(String(jobId))
      : null,
    fetcher,
    {
      refreshInterval: 5000, // Poll every 5 seconds in case results are still being aggregated
    },
  );

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const renderResults = () => {
    if (isLoading) {
      return (
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ py: 4 }}>
          <CircularProgress size="sm" />
          <Typography level="body-md">Loading sweep results...</Typography>
        </Stack>
      );
    }

    if (error || data?.status === 'error') {
      return (
        <Typography level="body-md" sx={{ color: 'danger.500', py: 2 }}>
          {data?.message || 'Failed to load sweep results'}
        </Typography>
      );
    }

    if (!data?.data) {
      return (
        <Typography level="body-md" sx={{ color: 'gray', py: 2 }}>
          No results available yet. Results will appear when all child jobs complete.
        </Typography>
      );
    }

    const results = data.data.results || [];
    if (results.length === 0) {
      return (
        <Typography level="body-md" sx={{ color: 'gray', py: 2 }}>
          No results available yet. Results will appear when child jobs complete.
        </Typography>
      );
    }
    const bestConfig = data.data.best_config;
    const bestJobId = data.data.best_job_id;
    const bestMetric = data.data.best_metric;
    const sweepMetric = data.data.sweep_metric || 'eval/loss';
    const lowerIsBetter = data.data.lower_is_better !== false;

    // Sort results if sortBy is set
    let sortedResults = [...results];
    if (sortBy === 'metric') {
      sortedResults.sort((a, b) => {
        const aVal = a.metric_value ?? Infinity;
        const bVal = b.metric_value ?? Infinity;
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });
    } else if (sortBy === 'run_index') {
      sortedResults.sort((a, b) => {
        return sortOrder === 'asc' ? a.run_index - b.run_index : b.run_index - a.run_index;
      });
    }

    // Get all parameter names from the first result
    const paramNames = results.length > 0 ? Object.keys(results[0].config || {}) : [];

    return (
      <Box>
        {/* Best Configuration Summary */}
        {bestConfig && (
          <Sheet
            variant="soft"
            color="success"
            sx={{ p: 2, mb: 3, borderRadius: 'sm' }}
          >
            <Typography level="title-md" sx={{ mb: 1 }}>
              🏆 Best Configuration
            </Typography>
            <Stack spacing={1}>
              <Typography level="body-sm">
                <strong>Metric ({sweepMetric}):</strong>{' '}
                {bestMetric?.[sweepMetric]?.toFixed(6) ?? 'N/A'}
              </Typography>
              <Typography level="body-sm">
                <strong>Job ID:</strong> {bestJobId}
              </Typography>
              <Box sx={{ mt: 1 }}>
                {Object.entries(bestConfig).map(([key, value]) => (
                  <Chip key={key} size="sm" variant="outlined" sx={{ mr: 1, mb: 1 }}>
                    {key}={String(value)}
                  </Chip>
                ))}
              </Box>
            </Stack>
          </Sheet>
        )}

        {/* Results Table */}
        <Box sx={{ overflowX: 'auto' }}>
          <Table stickyHeader sx={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSort('run_index')}
                >
                  Run{' '}
                  {sortBy === 'run_index' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Status</th>
                {paramNames.map((param) => (
                  <th key={param}>{param}</th>
                ))}
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSort('metric')}
                >
                  {sweepMetric}{' '}
                  {sortBy === 'metric' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Job ID</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result: any) => {
                const isBest = result.job_id === bestJobId;
                return (
                  <tr
                    key={result.run_index}
                    style={{
                      backgroundColor: isBest ? 'var(--joy-palette-success-50)' : undefined,
                    }}
                  >
                    <td>
                      <strong>{result.run_index}</strong>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={
                          result.status === 'COMPLETE'
                            ? 'success'
                            : result.status === 'FAILED'
                              ? 'danger'
                              : 'neutral'
                        }
                        variant="soft"
                      >
                        {result.status}
                      </Chip>
                    </td>
                    {paramNames.map((param) => (
                      <td key={param}>{String(result.config[param] ?? '-')}</td>
                    ))}
                    <td>
                      {result.metric_value !== null &&
                      result.metric_value !== undefined ? (
                        <Typography
                          level="body-sm"
                          sx={{
                            fontWeight: isBest ? 'bold' : 'normal',
                            color: isBest ? 'success.600' : undefined,
                          }}
                        >
                          {result.metric_value.toFixed(6)}
                        </Typography>
                      ) : (
                        <Typography level="body-sm" sx={{ color: 'gray' }}>
                          N/A
                        </Typography>
                      )}
                    </td>
                    <td>
                      <Typography level="body-xs">{result.job_id}</Typography>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Box>

        {results.length === 0 && (
          <Typography level="body-md" sx={{ color: 'gray', py: 2, textAlign: 'center' }}>
            No results available yet.
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Modal
      open={jobId !== -1}
      onClose={() => {
        setJobId(-1);
      }}
    >
      <ModalDialog sx={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 2 }}>
          Sweep Results - Job {jobId}
        </Typography>
        <Box
          sx={{
            height: 'calc(85vh - 100px)',
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {renderResults()}
        </Box>
      </ModalDialog>
    </Modal>
  );
}

