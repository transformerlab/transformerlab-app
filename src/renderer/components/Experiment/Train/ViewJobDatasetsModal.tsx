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
  const { data, isLoading, mutate } = useAPI(
    'jobs',
    ['getJobDatasets'],
    { jobId, experimentId: experimentInfo?.id },
  );

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

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '80%',
          maxWidth: '900px',
          height: '80%',
          maxHeight: '800px',
        }}
      >
        <ModalClose />
        <Typography level="h4">Job Datasets - Job {jobId}</Typography>
        <Typography level="body-sm" sx={{ mb: 2 }}>
          Datasets generated or stored in this job's directory
        </Typography>

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

        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'sm',
          }}
        >
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : datasets.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography level="body-md" color="neutral">
                No datasets found for this job
              </Typography>
            </Box>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Dataset Name</th>
                  <th style={{ width: '20%' }}>Size</th>
                  <th style={{ width: '30%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((dataset) => (
                  <tr key={dataset.name}>
                    <td>
                      <Typography level="body-sm">{dataset.name}</Typography>
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
                        startDecorator={<Save />}
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
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}
