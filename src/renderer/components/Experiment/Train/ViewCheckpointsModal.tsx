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

export default function ViewCheckpointsModal({ open, onClose, jobId }) {
  const { data, isLoading: checkpointsLoading } = useAPI(
    'jobs',
    ['getCheckpoints'],
    { jobId },
  );

  const handleRestartFromCheckpoint = (checkpoint) => {
    // TODO: Implement restart functionality
    console.log('Restarting from checkpoint:', checkpoint);
  };

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ minWidth: 600 }}>
        <ModalClose />

        <Typography level="h4" component="h2">
          Checkpoints for Job {jobId}
        </Typography>

        {checkpointsLoading ? (
          <Typography level="body-md">Loading checkpoints...</Typography>
        ) : (
          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Checkpoint</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.checkpoints?.map((checkpoint, index) => (
                  <tr key={index}>
                    <td>{checkpoint.filename}</td>
                    <td>{new Date(checkpoint.date).toLocaleString()}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outlined"
                        onClick={() =>
                          handleRestartFromCheckpoint(checkpoint.filename)
                        }
                        startDecorator={<PlayIcon />}
                      >
                        Restart train from here
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
