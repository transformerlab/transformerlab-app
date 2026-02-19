import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Button,
  Box,
  CircularProgress,
} from '@mui/joy';
import { PlayIcon } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { fetchWithAuth } from 'renderer/lib/authContext';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import { formatBytes } from 'renderer/lib/utils';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function ViewCheckpointsModal({ open, onClose, jobId }) {
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const [resumingCheckpoint, setResumingCheckpoint] = useState<string | null>(
    null,
  );
  const [settingInferenceCheckpoint, setSettingInferenceCheckpoint] = useState<
    string | null
  >(null);
  const { data, isLoading: checkpointsLoading } = useAPI(
    'jobs',
    ['getCheckpoints'],
    { jobId, experimentId: experimentInfo?.id },
  );

  const activeInferenceCheckpoint = useMemo(() => {
    try {
      const raw = experimentInfo?.config?.inferenceParams;
      const params = raw ? JSON.parse(raw) : {};
      if (String(params?.checkpointJobId || '') !== String(jobId)) {
        return '';
      }
      return params?.checkpointName || '';
    } catch (error) {
      return '';
    }
  }, [experimentInfo?.config?.inferenceParams, jobId]);

  const handleRestartFromCheckpoint = async (checkpoint) => {
    if (!experimentInfo?.id) {
      addNotification({
        type: 'error',
        message: 'Experiment ID is required',
      });
      return;
    }

    setResumingCheckpoint(checkpoint.filename);
    try {
      const url = getAPIFullPath('compute_provider', ['resumeFromCheckpoint'], {
        jobId,
        experimentId: experimentInfo.id,
      });

      const response = await fetchWithAuth(url, {
        method: 'POST',
        body: JSON.stringify({ checkpoint: checkpoint.filename }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: `Job ${result.job_id} queued to resume from checkpoint "${checkpoint.filename}"`,
      });
      onClose();
    } catch (error) {
      addNotification({
        type: 'error',
        message: `Failed to resume from checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setResumingCheckpoint(null);
    }
  };

  const handleUseForInference = async (checkpoint) => {
    if (!experimentInfo?.id) {
      addNotification({
        type: 'error',
        message: 'Experiment ID is required',
      });
      return;
    }

    setSettingInferenceCheckpoint(checkpoint.filename);
    try {
      const rawInferenceParams =
        experimentInfo?.config?.inferenceParams || '{}';
      const currentInferenceParams = JSON.parse(rawInferenceParams);
      const updatedInferenceParams = {
        ...currentInferenceParams,
        checkpointJobId: String(jobId),
        checkpointName: checkpoint.filename,
      };

      const updateResponse = await fetchWithAuth(
        chatAPI.Endpoints.Experiment.UpdateConfig(
          experimentInfo.id,
          'inferenceParams',
          JSON.stringify(updatedInferenceParams),
        ),
      );

      if (!updateResponse.ok) {
        throw new Error(`HTTP ${updateResponse.status}`);
      }

      addNotification({
        type: 'success',
        message: `Checkpoint "${checkpoint.filename}" is now selected for inference.`,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        message: `Failed to update inference checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setSettingInferenceCheckpoint(null);
    }
  };

  let noCheckpoints = false;

  if (!checkpointsLoading && data?.checkpoints?.length === 0) {
    noCheckpoints = true;
  }

  const hasDate = !!data?.checkpoints?.some((cp) => cp.date);
  const hasSize = !!data?.checkpoints?.some((cp) => cp.size);

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ minWidth: '80%', height: '80vh' }}>
        <ModalClose />

        {noCheckpoints ? (
          <Typography level="body-md" sx={{ textAlign: 'center', py: 4 }}>
            No checkpoints were saved in this job.
          </Typography>
        ) : (
          <>
            <Typography level="h4" component="h2">
              Checkpoints for Job {jobId}
            </Typography>

            {!checkpointsLoading &&
              data &&
              (data.model_name || data.adaptor_name) && (
                <Box sx={{ mb: 2 }}>
                  {data.model_name && (
                    <Typography level="body-md">
                      <strong>Model:</strong> {data.model_name}
                    </Typography>
                  )}
                  {data.adaptor_name && (
                    <Typography level="body-md">
                      <strong>Adaptor:</strong> {data.adaptor_name}
                    </Typography>
                  )}
                </Box>
              )}

            {checkpointsLoading ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mt: 2,
                }}
              >
                <CircularProgress
                  sx={{
                    '--CircularProgress-size': '18px',
                    '--CircularProgress-trackThickness': '4px',
                    '--CircularProgress-progressThickness': '2px',
                  }}
                />
                <Typography level="body-md">Loading checkpoints...</Typography>
              </Box>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th width="50px">#</th>
                      <th>Checkpoint</th>
                      {hasDate && <th>Date</th>}
                      {hasSize && <th width="100px">Size</th>}
                      <th style={{ textAlign: 'right' }}>&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.checkpoints?.map((checkpoint, index) => (
                      <tr key={index}>
                        <td>
                          <Typography level="body-sm">
                            {data?.checkpoints?.length - index}.
                          </Typography>
                        </td>
                        <td>
                          <Typography level="title-sm">
                            {checkpoint.filename}
                          </Typography>
                        </td>
                        {hasDate && (
                          <td>
                            {checkpoint.date
                              ? new Date(checkpoint.date).toLocaleString()
                              : '-'}
                          </td>
                        )}
                        {hasSize && (
                          <td>
                            {checkpoint.size
                              ? formatBytes(checkpoint.size)
                              : '-'}
                          </td>
                        )}
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() =>
                              handleRestartFromCheckpoint(checkpoint)
                            }
                            startDecorator={<PlayIcon />}
                            loading={resumingCheckpoint === checkpoint.filename}
                            disabled={resumingCheckpoint !== null}
                          >
                            Restart training from here
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              activeInferenceCheckpoint === checkpoint.filename
                                ? 'solid'
                                : 'soft'
                            }
                            sx={{ ml: 1 }}
                            onClick={() => handleUseForInference(checkpoint)}
                            loading={
                              settingInferenceCheckpoint === checkpoint.filename
                            }
                            disabled={settingInferenceCheckpoint !== null}
                          >
                            {activeInferenceCheckpoint === checkpoint.filename
                              ? 'Used for inference'
                              : 'Use for inference'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Box>
            )}
          </>
        )}
      </ModalDialog>
    </Modal>
  );
}
