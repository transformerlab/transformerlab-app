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
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

export default function ViewCheckpointsModal({ open, onClose, jobId }) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading: checkpointsLoading } = useAPI(
    'jobs',
    ['getCheckpoints'],
    { jobId, experimentId: experimentInfo?.id },
  );

  const { data: jobData } = useAPI('jobs', ['get'], { id: jobId });

  const templateId = jobData?.job_data?.template_id;

  const handleRestartFromCheckpoint = async (checkpoint) => {
    const inputOverride = JSON.stringify({
      restart_from_checkpoint: checkpoint,
    });

    const url = getAPIFullPath('tasks', ['queue'], {
      id: templateId,
    });

    // fetch the above URL and add the inputOverride as a query parameter
    const inputOverrideEncoded = encodeURIComponent(inputOverride);
    await fetch(`${url}?input_override=${inputOverrideEncoded}`);
  };

  let noCheckpoints = false;

  if (!checkpointsLoading && data?.checkpoints?.length === 0) {
    noCheckpoints = true;
  }

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ minWidth: '80%', overflowY: 'auto' }}>
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
                  <Typography level="body-md">
                    <strong>Template:</strong>{' '}
                    {jobData?.job_data?.template_name || ''} ({templateId || ''})
                  </Typography>
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
                              handleRestartFromCheckpoint(checkpoint.filename)
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
