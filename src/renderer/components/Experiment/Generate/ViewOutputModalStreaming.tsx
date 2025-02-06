import useSWR from 'swr';

import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OutputTerminal from 'renderer/components/OutputTerminal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ViewOutputModalStreaming({ jobId, setJobId }) {
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
          <OutputTerminal
            logEndpoint={chatAPI.Endpoints.Experiment.StreamOutputFromJob(
              jobId
            )}
            lineAnimationDelay={5}
          />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
