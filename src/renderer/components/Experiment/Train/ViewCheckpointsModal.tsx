import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Button,
  Box,
} from '@mui/joy';
import { PlayIcon } from 'lucide-react';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';

export default function ViewCheckpointsModal({ open, onClose, jobId }) {
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const { data, isLoading: checkpointsLoading } = useAPI(
    'jobs',
    ['getCheckpoints'],
    { jobId, experimentId: experimentInfo?.id },
  );

  const handleRestartFromCheckpoint = async (checkpoint) => {
    // Show immediate feedback
    addNotification({
      type: 'warning',
      message: 'Starting training resume from checkpoint...',
    });

    try {
      const formData = new FormData();
      formData.append('experimentId', experimentInfo?.id);
      formData.append('checkpoint', checkpoint.filename);
      formData.append('parent_job_id', jobId);

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.LaunchRemote(experimentInfo?.id),
        {
          method: 'POST',
          body: formData,
        },
      );

      if (response.ok) {
        const result = await response.json();
        console.log('Resume from checkpoint response:', result);
        addNotification({
          type: 'success',
          message: `Training resumed successfully! New job ID: ${result.job_id}`,
        });
        onClose(); // Close the modal
      } else {
        const error = await response.json();
        addNotification({
          type: 'danger',
          message: `Failed to resume training: ${error.message}`,
        });
      }
    } catch (error) {
      addNotification({
        type: 'danger',
        message: `Error resuming training: ${(error as Error).message}`,
      });
    }
  };

  let noCheckpoints = false;

  if (!checkpointsLoading && data?.checkpoints?.length === 0) {
    noCheckpoints = true;
  }

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ minWidth: '80%' }}>
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
              <Typography level="body-md">Loading checkpoints...</Typography>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th width="50px">#</th>
                      <th>Checkpoint</th>
                      <th>Date</th>
                      <th width="100px">Size</th>
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
                        <td>{new Date(checkpoint.date).toLocaleString()}</td>
                        <td>{formatBytes(checkpoint.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() =>
                              handleRestartFromCheckpoint(checkpoint)
                            }
                            startDecorator={<PlayIcon />}
                          >
                            Restart training from here
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
