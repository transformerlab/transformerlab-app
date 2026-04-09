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
import { fetchWithAuth } from 'renderer/lib/authContext';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import SaveToRegistryDialog, { SaveVersionInfo } from '../SaveToRegistryDialog';

interface DatasetsSectionProps {
  open?: boolean;
  onClose?: () => void;
  jobId: number | string | null;
  renderContentOnly?: boolean;
  onCountLoaded?: (count: number) => void;
}

interface Dataset {
  name: string;
  size?: number;
  date?: string;
}

export default function DatasetsSection({
  open = false,
  onClose = () => {},
  jobId,
  renderContentOnly = false,
  onCountLoaded,
}: DatasetsSectionProps) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading, mutate } = useAPI('jobs', ['getJobDatasets'], {
    jobId,
    experimentId: experimentInfo?.id,
  });

  const [savingDataset, setSavingDataset] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveDialogDataset, setSaveDialogDataset] = useState<string | null>(
    null,
  );
  const [saveTaskJobId, setSaveTaskJobId] = useState<string | null>(null);
  const [assetNameError, setAssetNameError] = useState<string | null>(null);

  // Fetch existing datasets in the registry for "Add to existing" option
  const { data: registryDatasets } = useSWR(
    open || renderContentOnly ? chatAPI.Endpoints.Dataset.LocalList() : null,
    fetcher,
  );
  const existingDatasetNames: string[] = Array.isArray(registryDatasets)
    ? registryDatasets.map((d: { dataset_id: string }) => d.dataset_id)
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
        `Successfully saved ${savingDataset ?? 'dataset'} to registry`;
      setSaveSuccess(msg);
      setSavingDataset(null);
      setSaveTaskJobId(null);
      setSaveDialogDataset(null);
      mutate();
    } else if (status === 'FAILED') {
      const errMsg =
        jobData.error_msg || 'Save to registry failed — check server logs';
      setSaveError(errMsg);
      setSavingDataset(null);
      setSaveTaskJobId(null);
    }
  }, [saveTaskData, saveTaskJobId]);

  const datasets: Dataset[] = data?.datasets || [];

  useEffect(() => {
    if (!isLoading && data?.datasets) {
      onCountLoaded?.(data.datasets.length);
    }
  }, [isLoading, data]);

  const handleSaveToRegistry = async (
    datasetName: string,
    info: SaveVersionInfo,
  ) => {
    setSavingDataset(datasetName);
    setSaveError(null);
    setSaveSuccess(null);
    setAssetNameError(null);

    try {
      const url = getAPIFullPath('jobs', ['saveDatasetToRegistry'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        datasetName,
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
        let errorMessage = 'Failed to save dataset to registry';
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
          setSavingDataset(null);
          return;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.status === 'started' && result.task_job_id) {
        // Background task started — polling will handle completion
        setSaveTaskJobId(String(result.task_job_id));
        // Close the dialog immediately; the progress bar in the table shows status
        setSaveDialogDataset(null);
      } else {
        // Unexpected response shape — treat as immediate success for safety
        setSaveSuccess(
          result.message || `Successfully saved ${datasetName} to registry`,
        );
        setSaveDialogDataset(null);
        setSavingDataset(null);
        mutate();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Failed to save dataset:', error);
      setSaveError(errorMessage);
      setSavingDataset(null);
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

  const noDatasetsFound = !isLoading && datasets.length === 0;

  const content = (
    <>
      {savingDataset && saveTaskJobId && (
        <Alert color="primary" sx={{ mb: 2 }}>
          <Stack spacing={1} sx={{ width: '100%' }}>
            <Typography level="body-sm">
              Publishing <strong>{savingDataset}</strong> to registry…
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

      {noDatasetsFound ? null : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {isLoading ? (
            <Typography level="body-md">Loading datasets...</Typography>
          ) : (
            <List
              sx={{
                overflow: 'auto',
                borderRadius: 'sm',
                border: '1px solid',
                borderColor: 'divider',
                p: 0,
              }}
            >
              {datasets.map((dataset) => (
                <ListItem key={dataset.name}>
                  <ListItemButton
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <ListItemContent sx={{ flex: 1, minWidth: 0 }}>
                      <Typography level="title-sm" noWrap>
                        {dataset.name}
                      </Typography>
                      {dataset.size && (
                        <Typography level="body-xs">
                          {formatBytes(dataset.size)}
                        </Typography>
                      )}
                    </ListItemContent>
                    <Button
                      size="sm"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSaveDialogDataset(dataset.name);
                      }}
                      startDecorator={<Save size={16} />}
                      loading={savingDataset === dataset.name}
                      disabled={savingDataset !== null}
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
      open={saveDialogDataset !== null}
      onClose={() => {
        setSaveDialogDataset(null);
        setAssetNameError(null);
      }}
      sourceName={saveDialogDataset || ''}
      type="dataset"
      existingNames={existingDatasetNames}
      saving={savingDataset !== null}
      jobId={jobId ?? undefined}
      assetNameError={assetNameError}
      onSave={(info) => {
        if (saveDialogDataset) {
          handleSaveToRegistry(saveDialogDataset, info);
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
          <Typography
            id="datasets-modal-title"
            level="h2"
            sx={{ mb: 2, mr: 4 }}
          >
            Datasets for Job {jobId}
          </Typography>
          {content}
        </ModalDialog>
      </Modal>
      {saveDialog}
    </>
  );
}
