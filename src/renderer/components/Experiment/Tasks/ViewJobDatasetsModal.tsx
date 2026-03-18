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
import { fetchWithAuth } from 'renderer/lib/authContext';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import SaveToRegistryDialog, { SaveVersionInfo } from './SaveToRegistryDialog';

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
  const [saveDialogDataset, setSaveDialogDataset] = useState<string | null>(
    null,
  );
  const [saveTaskJobId, setSaveTaskJobId] = useState<string | null>(null);

  // Fetch existing datasets in the registry for "Add to existing" option
  const { data: registryDatasets } = useSWR(
    open ? chatAPI.Endpoints.Dataset.LocalList() : null,
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
        : saveTaskData.job_data ?? {};

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

  const existingDatasetNames: string[] = Array.isArray(registryDatasets)
    ? registryDatasets
        .map((d: any) => d.dataset_id || d.name || d.id)
        .filter(Boolean)
    : [];

  const datasets: Dataset[] = data?.datasets || [];

  const handleSaveToRegistry = async (
    datasetName: string,
    info: SaveVersionInfo,
  ) => {
    setSavingDataset(datasetName);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const url = getAPIFullPath('jobs', ['saveDatasetToRegistry'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        datasetName,
        targetName: info.groupName,
        mode: info.mode,
        tag: info.tag,
        versionLabel: info.versionLabel,
        description: info.description,
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
            <Typography id="datasets-modal-title" level="h2">
              Datasets for Job {jobId}
            </Typography>
          </Stack>

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
                            <Typography level="title-sm">
                              {dataset.name}
                            </Typography>
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
                              onClick={() => setSaveDialogDataset(dataset.name)}
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
      <SaveToRegistryDialog
        open={saveDialogDataset !== null}
        onClose={() => setSaveDialogDataset(null)}
        sourceName={saveDialogDataset || ''}
        type="dataset"
        existingNames={existingDatasetNames}
        saving={savingDataset !== null}
        jobId={jobId}
        onSave={(info) => {
          if (saveDialogDataset) {
            handleSaveToRegistry(saveDialogDataset, info);
          }
        }}
      />
    </>
  );
}
