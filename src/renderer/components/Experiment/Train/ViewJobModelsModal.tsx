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

interface ViewJobModelsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}

interface Model {
  name: string;
  size?: number;
  date?: string;
}

export default function ViewJobModelsModal({
  open,
  onClose,
  jobId,
}: ViewJobModelsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading, mutate } = useAPI(
    'jobs',
    ['getJobModels'],
    { jobId, experimentId: experimentInfo?.id },
  );

  const [savingModel, setSavingModel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const models: Model[] = data?.models || [];

  const handleSaveToRegistry = async (modelName: string) => {
    setSavingModel(modelName);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const url = getAPIFullPath('jobs', ['saveModelToRegistry'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        modelName,
      });

      const response = await fetchWithAuth(url, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to save model to registry');
      }

      setSaveSuccess(`Successfully saved ${modelName} to registry`);
      // Refresh the model list
      mutate();
    } catch (error) {
      console.error('Failed to save model:', error);
      setSaveError(`Failed to save ${modelName} to registry`);
    } finally {
      setSavingModel(null);
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
        <Typography level="h4">Job Models - Job {jobId}</Typography>
        <Typography level="body-sm" sx={{ mb: 2 }}>
          Models generated or stored in this job's directory
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
          ) : models.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography level="body-md" color="neutral">
                No models found for this job
              </Typography>
            </Box>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Model Name</th>
                  <th style={{ width: '20%' }}>Size</th>
                  <th style={{ width: '30%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.name}>
                    <td>
                      <Typography level="body-sm">{model.name}</Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {model.size ? formatBytes(model.size) : '-'}
                      </Typography>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outlined"
                        onClick={() => handleSaveToRegistry(model.name)}
                        startDecorator={<Save />}
                        loading={savingModel === model.name}
                        disabled={savingModel !== null}
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
