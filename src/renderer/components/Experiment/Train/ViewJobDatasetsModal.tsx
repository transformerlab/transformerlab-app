import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Box,
  CircularProgress,
  Button,
  Stack,
  Alert,
  Sheet,
} from '@mui/joy';
import { Save } from 'lucide-react';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';

interface ViewJobDatasetsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}

interface Dataset {
  name: string;
  size?: number;
  date?: string;
}

export default function ViewJobDatasetsModal({
  open,
  onClose,
  jobId,
}: ViewJobDatasetsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading, mutate } = useAPI('jobs', ['getJobDatasets'], {
    jobId,
    experimentId: experimentInfo?.id,
  });

  const [savingDataset, setSavingDataset] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const datasets: Dataset[] = data?.datasets || [];

  const handleSaveToRegistry = async (datasetName: string) => {
    setSavingDataset(datasetName);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const url = getAPIFullPath('jobs', ['saveDatasetToRegistry'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        datasetName,
      });

      const response = await fetchWithAuth(url, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to save dataset to registry');
      }

      setSaveSuccess(`Successfully saved ${datasetName} to registry`);
      // Refresh the dataset list
      mutate();
    } catch (error) {
      console.error('Failed to save dataset:', error);
      setSaveError(`Failed to save ${datasetName} to registry`);
    } finally {
      setSavingDataset(null);
    }
  };

  useEffect(() => {
    if (saveSuccess || saveError) {
      const timer = setTimeout(() => {
        setSaveSuccess(null);
        setSaveError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess, saveError]);

  const noDatasetsFound = !isLoading && datasets.length === 0;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '90vw',
          height: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2, mr: 4 }}
        >
          <Typography id="datasets-modal-title" level="h2">
            Datasets for Job {jobId}
          </Typography>
        </Stack>

        {saveSuccess && (
          <Alert color="success" sx={{ mb: 2 }}>
            {saveSuccess}
          </Alert>
        )}

        {saveError && (
          <Alert color="danger" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}

        {noDatasetsFound ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography level="body-lg" color="neutral">
              No datasets found for this job.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flex: 1,
            }}
          >
            <Typography level="body-md" sx={{ mt: 1, mb: 2 }}>
              This job has{' '}
              {datasets.length || (
                <CircularProgress
                  sx={{
                    '--CircularProgress-size': '18px',
                    '--CircularProgress-trackThickness': '4px',
                    '--CircularProgress-progressThickness': '2px',
                  }}
                />
              )}{' '}
              dataset(s):
            </Typography>

            {isLoading ? (
              <Typography level="body-md">Loading datasets...</Typography>
            ) : (
              <Sheet
                sx={{
                  overflow: 'auto',
                  borderRadius: 'sm',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Table stickyHeader>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th style={{ width: '50%' }}>Dataset Name</th>
                      <th style={{ width: '20%' }}>Size</th>
                      <th style={{ width: '30%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.map((dataset, index) => (
                      <tr key={dataset.name}>
                        <td>
                          <Typography level="body-sm">
                            {datasets.length - index}.
                          </Typography>
                        </td>
                        <td>
                          <Typography level="title-sm">{dataset.name}</Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {dataset.size ? formatBytes(dataset.size) : '-'}
                          </Typography>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() => handleSaveToRegistry(dataset.name)}
                            startDecorator={<Save size={16} />}
                            loading={savingDataset === dataset.name}
                            disabled={savingDataset !== null}
                          >
                            Save to Registry
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            )}
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
