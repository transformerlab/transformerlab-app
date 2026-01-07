import React, { useEffect, useState } from 'react';
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
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

function formatColumnNames(name) {
  return name
    .replace(/([A-Z])/g, ' $1') // Convert Camel Case to spaced
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/_/g, ' '); // Replace underscores with spaces
}

function heatedColor(value) {
  const h = value * 240;
  return `hsla(${h}, 100%, 50%, 0.3)`;
}

function formatScore(score) {
  // if score is a number, return it as is
  if (!isNaN(score)) {
    return score;
  } else {
    // if score is a string, try to parse it as a float
    const parsedScore = parseFloat(score);
    // if parsedScore is not a number, return the original score
    if (isNaN(parsedScore)) {
      return score;
    } else {
      return parsedScore;
    }
  }
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
  const [report, setReport] = useState<{ header: string[]; body: any[] }>({
    header: [],
    body: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [evalResultsFiles, setEvalResultsFiles] = useState<string[]>([]);

  // Fetch job data to get list of eval results files
  useEffect(() => {
    if (open && jobId && experimentInfo?.id) {
      setIsLoading(true);
      setError(null);
      fetcher(chatAPI.Endpoints.Jobs.Get(experimentInfo.id, String(jobId)))
        .then((job) => {
          const jobData = job?.job_data || {};
          const evalResults = jobData.eval_results || [];
          if (Array.isArray(evalResults) && evalResults.length > 0) {
            setEvalResultsFiles(evalResults);
            // Reset to first file when modal opens
            setSelectedFileIndex(0);
          } else {
            setEvalResultsFiles([]);
            setError('No evaluation results found');
            setIsLoading(false);
          }
        })
        .catch((err) => {
          console.error('Error fetching job data:', err);
          setEvalResultsFiles([]);
          setError('Failed to load evaluation results');
          setIsLoading(false);
        });
    } else if (!open) {
      // Reset state when modal closes
      setIsLoading(false);
      setError(null);
      setEvalResultsFiles([]);
      setReport({ header: [], body: [] });
    }
  }, [open, jobId, experimentInfo?.id]);

  // Fetch the selected eval results file
  useEffect(() => {
    if (
      open &&
      jobId &&
      experimentInfo?.id &&
      evalResultsFiles.length > 0 &&
      selectedFileIndex >= 0 &&
      selectedFileIndex < evalResultsFiles.length
    ) {
      setIsLoading(true);
      setError(null);
      fetcher(
        chatAPI.Endpoints.Experiment.GetEvalResults(
          experimentInfo.id,
          String(jobId),
          'view',
          selectedFileIndex,
        ),
      )
        .then((data) => {
          try {
            if (data?.header && data?.body) {
              setReport(data);
            } else {
              setError('Invalid data format');
            }
          } catch (e) {
            setError('Error parsing evaluation results');
          }
        })
        .catch((err) => {
          setError('Failed to load evaluation results');
          console.error('Error loading eval results:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [
    open,
    jobId,
    experimentInfo?.id,
    selectedFileIndex,
    evalResultsFiles.length,
  ]);

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
      console.error('Error downloading eval results:', err);
    }
  };

  // Get display name for file selector
  const getFileName = (filePath: string, index: number) => {
    const filename = filePath.split('/').pop() || `File ${index + 1}`;
    return filename;
  };

  // Find the score column index
  const scoreColumnIndex = report.header.findIndex(
    (col) => col.toLowerCase() === 'score',
  );

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
                {evalResultsFiles.map((filePath, index) => (
                  <Option key={index} value={index}>
                    {getFileName(filePath, index)}
                  </Option>
                ))}
              </Select>
            </FormControl>
          )}
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
              Loading evaluation results...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="danger">{error}</Typography>
          </Box>
        ) : (
          <Box sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  {report?.header &&
                    report?.header.map((col) => (
                      <th key={col}>{formatColumnNames(col)}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {report?.body?.map((row, i) => (
                  <tr key={i}>
                    {row.map((col, j) => (
                      <td key={j}>
                        {scoreColumnIndex !== -1 && j === scoreColumnIndex ? (
                          <div
                            style={{
                              backgroundColor: heatedColor(
                                parseFloat(formatScore(col)) || 0,
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
        )}
      </ModalDialog>
    </Modal>
  );
};

export default ViewEvalResultsModal;
