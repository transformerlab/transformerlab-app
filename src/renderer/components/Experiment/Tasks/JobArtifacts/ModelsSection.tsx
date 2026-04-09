import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Box,
  Button,
  Stack,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
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
import SaveToRegistryDialog, { SaveVersionInfo } from '../SaveToRegistryDialog';

interface ModelsSectionProps {
  open?: boolean;
  onClose?: () => void;
  jobId: number | string | null;
  renderContentOnly?: boolean;
  onCountLoaded?: (count: number) => void;
}

interface Model {
  name: string;
  size?: number;
  date?: string;
}

export default function ModelsSection({
  open = false,
  onClose = () => {},
  jobId,
  renderContentOnly = false,
  onCountLoaded,
}: ModelsSectionProps) {
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
    open || renderContentOnly ? chatAPI.Endpoints.Models.LocalList() : null,
    fetcher,
  );
  const existingModelNames: string[] = Array.isArray(registryModels)
    ? registryModels.map((m: { model_id: string }) => m.model_id)
    : [];

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

  const models: Model[] = data?.models || [];

  useEffect(() => {
    if (!isLoading && data?.models) {
      onCountLoaded?.(data.models.length);
    }
  }, [isLoading, data]);

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
        targetName: info.groupId || info.groupName,
        assetName: info.assetName,
        mode: info.mode,
        tag: info.tag,
        versionLabel: info.versionLabel,
        description: info.description,
        groupName: info.groupName,
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

  const content = (
    <>
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

      {noModelsFound ? null : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {isLoading ? (
            <Typography level="body-md">Loading models...</Typography>
          ) : (
            <List
              sx={{
                overflow: 'auto',
                p: 0,
              }}
            >
              {models.map((model) => (
                <ListItem key={model.name}>
                  <ListItemButton
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <ListItemContent sx={{ flex: 1, minWidth: 0 }}>
                      <Typography level="title-sm" noWrap>
                        {model.name}
                      </Typography>
                      {model.size && (
                        <Typography level="body-xs">
                          {formatBytes(model.size)}
                        </Typography>
                      )}
                    </ListItemContent>
                    <Button
                      size="sm"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSaveDialogModel(model.name);
                      }}
                      startDecorator={<Save size={16} />}
                      loading={savingModel === model.name}
                      disabled={savingModel !== null}
                      sx={{ flexShrink: 0 }}
                    >
                      Save to Registry
                    </Button>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}
    </>
  );

  const saveDialog = (
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
      jobId={jobId ?? undefined}
      assetNameError={assetNameError}
      onSave={(info) => {
        if (saveDialogModel) {
          handleSaveToRegistry(saveDialogModel, info);
        }
      }}
    />
  );

  if (renderContentOnly) {
    return (
      <>
        {content}
        {saveDialog}
      </>
    );
  }

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
          <Typography id="models-modal-title" level="h2" sx={{ mb: 2, mr: 4 }}>
            Models for Job {jobId}
          </Typography>
          {content}
        </ModalDialog>
      </Modal>
      {saveDialog}
    </>
  );
}
