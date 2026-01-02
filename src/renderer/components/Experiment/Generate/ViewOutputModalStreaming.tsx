import { useMemo } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OutputTerminal from 'renderer/components/OutputTerminal';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

export default function ViewOutputModalStreaming({ jobId, setJobId }) {
  const { experimentInfo } = useExperimentInfo();
  if (!experimentInfo) return null;

  // Memoize the logEndpoint to prevent OutputTerminal from reinitializing on every render
  const logEndpoint = useMemo(
    () =>
      chatAPI.Endpoints.Experiment.StreamOutputFromJob(
        experimentInfo.id,
        jobId,
      ),
    [experimentInfo.id, jobId],
  );

  return (
    <Modal open={jobId != -1} onClose={() => setJobId(-1)}>
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
        <Typography level="title-lg">Output from job: {jobId}</Typography>
        <Box
          sx={{
            height: '100%',
            overflow: 'hidden',
            border: '10px solid #444',
            padding: '0rem 0 0 1rem',
            backgroundColor: '#000',
            width: '100%',
          }}
        >
          <OutputTerminal logEndpoint={logEndpoint} lineAnimationDelay={5} />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
