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
import { formatBytes } from 'renderer/lib/utils';

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
      <ModalDialog sx={{ minWidth: '80%' }}>
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
                  <th width="50px">#</th>
                  <th>Checkpoint</th>
                  <th>Date</th>
                  <th width="100px">Size</th>
                  <th>Action</th>
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
                    <td>
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
      </ModalDialog>
    </Modal>
  );
}
