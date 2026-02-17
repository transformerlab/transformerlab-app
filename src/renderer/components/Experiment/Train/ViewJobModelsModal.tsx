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
  const { data, isLoading, mutate } = useAPI('jobs', ['getJobModels'], {
    jobId,
    experimentId: experimentInfo?.id,
  });

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
        let errorMessage = 'Failed to save model to registry';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = `${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setSaveSuccess(`Successfully saved ${modelName} to registry`);
      // Refresh the model list
      mutate();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Failed to save model:', error);
      setSaveError(errorMessage);
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

  const noModelsFound = !isLoading && models.length === 0;

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
          <Typography id="models-modal-title" level="h2">
            Models for Job {jobId}
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

        {noModelsFound ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography level="body-lg" color="neutral">
              No models found for this job.
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
              {models.length || (
                <CircularProgress
                  sx={{
                    '--CircularProgress-size': '18px',
                    '--CircularProgress-trackThickness': '4px',
                    '--CircularProgress-progressThickness': '2px',
                  }}
                />
              )}{' '}
              model(s):
            </Typography>

            {isLoading ? (
              <Typography level="body-md">Loading models...</Typography>
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
                      <th style={{ width: '50%' }}>Model Name</th>
                      <th style={{ width: '20%' }}>Size</th>
                      <th style={{ width: '30%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model, index) => (
                      <tr key={model.name}>
                        <td>
                          <Typography level="body-sm">
                            {models.length - index}.
                          </Typography>
                        </td>
                        <td>
                          <Typography level="title-sm">{model.name}</Typography>
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
                            startDecorator={<Save size={16} />}
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
              </Sheet>
            )}
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
