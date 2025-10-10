import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import PollingOutputTerminal from './PollingOutputTerminal';

export default function ViewOutputModalStreaming({ jobId, setJobId }) {
  const { experimentInfo } = useExperimentInfo();
  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  return (
    <Modal
      open={jobId !== -1}
      onClose={() => {
        setJobId(-1);
      }}
    >
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Output from job: {jobId}
        </Typography>

        <Box
          sx={{
            height: '60vh',
            overflow: 'hidden',
            border: '10px solid #444',
            padding: '0rem 0 0 1rem',
            backgroundColor: '#000',
            width: '100%',
          }}
        >
          <PollingOutputTerminal
            jobId={jobId}
            experimentId={experimentInfo.id}
            lineAnimationDelay={5}
            refreshInterval={2000}
            initialMessage="Loading job output..."
          />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
