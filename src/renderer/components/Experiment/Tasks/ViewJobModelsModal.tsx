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
  LinearProgress,
} from '@mui/joy';
import { Save } from 'lucide-react';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import {
  fetchWithAuth,
  useSWRWithAuth as useSWR,
} from 'renderer/lib/authContext';
import SaveToRegistryDialog, { SaveVersionInfo } from './SaveToRegistryDialog';

interface ViewJobModelsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number | string | null;
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
  const [saveDialogModel, setSaveDialogModel] = useState<string | null>(null);
  const [saveTaskJobId, setSaveTaskJobId] = useState<string | null>(null);
  const [assetNameError, setAssetNameError] = useState<string | null>(null);

  // Fetch existing models in the registry for "Add to existing" option
  const { data: registryModels } = useSWR(
    open ? chatAPI.Endpoints.Models.LocalList() : null,
    fetcher,
  );

  // Poll the background save-to-registry job when one is active
  const { data: saveTaskData } = useSWR(
    saveTaskJobId && experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, saveTaskJobId)
      : null,
    fetcher,
    {
      refreshInterval: 2000,
      revalidateOnFocus: false,
    },
  );

  // React to background task completion / failure
  useEffect(() => {
    if (!saveTaskData || !saveTaskJobId) return;
    const status = saveTaskData.status;
    const jobData =
      typeof saveTaskData.job_data === 'string'
        ? JSON.parse(saveTaskData.job_data || '{}')
        : (saveTaskData.job_data ?? {});

    if (status === 'COMPLETE') {
      const msg =
        jobData.result_message ||
        `Successfully saved ${savingModel ?? 'model'} to registry`;
      setSaveSuccess(msg);
      setSavingModel(null);
      setSaveTaskJobId(null);
      setSaveDialogModel(null);
      mutate();
    } else if (status === 'FAILED') {
      const errMsg =
        jobData.error_msg || 'Save to registry failed — check server logs';
      setSaveError(errMsg);
      setSavingModel(null);
      setSaveTaskJobId(null);
    }
  }, [saveTaskData, saveTaskJobId]);

  const existingModelNames: string[] = Array.isArray(registryModels)
    ? registryModels
        .map((m: any) => m.model_id || m.name || m.id)
        .filter(Boolean)
    : [];

  const models: Model[] = data?.models || [];

  const handleSaveToRegistry = async (
    modelName: string,
    info: SaveVersionInfo,
  ) => {
    setSavingModel(modelName);
    setSaveError(null);
    setSaveSuccess(null);
    setAssetNameError(null);

    try {
      const url = getAPIFullPath('jobs', ['saveModelToRegistry'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        modelName,
        targetName: info.groupName,
        assetName: info.assetName,
        mode: info.mode,
        tag: info.tag,
        versionLabel: info.versionLabel,
        description: info.description,
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
        // If it's a 409 conflict (name already exists), show inline on the asset name field
        if (response.status === 409) {
          setAssetNameError(errorMessage);
          setSavingModel(null);
          return;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.status === 'started' && result.task_job_id) {
        // Background task started — polling will handle completion
        setSaveTaskJobId(String(result.task_job_id));
        // Close the dialog immediately; the progress bar in the table shows status
        setSaveDialogModel(null);
      } else {
        // Unexpected response shape — treat as immediate success for safety
        setSaveSuccess(
          result.message || `Successfully saved ${modelName} to registry`,
        );
        setSaveDialogModel(null);
        setSavingModel(null);
        mutate();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Failed to save model:', error);
      setSaveError(errorMessage);
      setSavingModel(null);
    }
  };

  useEffect(() => {
    if (saveSuccess || saveError) {
      const timer = setTimeout(() => {
        setSaveSuccess(null);
        setSaveError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess, saveError]);

  const noModelsFound = !isLoading && models.length === 0;

  return (
    <>
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

          {savingModel && saveTaskJobId && (
            <Alert color="primary" sx={{ mb: 2 }}>
              <Stack spacing={1} sx={{ width: '100%' }}>
                <Typography level="body-sm">
                  Publishing <strong>{savingModel}</strong> to registry…
                </Typography>
                <LinearProgress />
              </Stack>
            </Alert>
          )}

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
                            <Typography level="title-sm">
                              {model.name}
                            </Typography>
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
                              onClick={() => setSaveDialogModel(model.name)}
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
      <SaveToRegistryDialog
        open={saveDialogModel !== null}
        onClose={() => {
          setSaveDialogModel(null);
          setAssetNameError(null);
        }}
        sourceName={saveDialogModel || ''}
        type="model"
        existingNames={existingModelNames}
        saving={savingModel !== null}
        jobId={jobId}
        assetNameError={assetNameError}
        onSave={(info) => {
          if (saveDialogModel) {
            handleSaveToRegistry(saveDialogModel, info);
          }
        }}
      />
    </>
  );
}
