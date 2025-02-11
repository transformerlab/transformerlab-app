import useSWR from 'swr';

import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OutputTerminal from 'renderer/components/OutputTerminal';

const fetcher = (url) => fetch(url).then((res) => res.json());

interface ViewOutputModalStreamingProps {
  jobId: number;
  setJobId: (id: number) => void;
  fileName?: string | null;
  setFileName: (value: string) => void;
}

export default function ViewOutputModalStreaming({ jobId, setJobId, fileName,  setFileName}: ViewOutputModalStreamingProps) {
  const logEndpoint = fileName !== ''
  ? chatAPI.Endpoints.Experiment.StreamDetailedJSONReportFromJob(jobId, fileName)
  : chatAPI.Endpoints.Experiment.StreamOutputFromJob(jobId);
  const title_sentence = fileName !== '' ? 'Detailed Report for Job' : 'Output from Job';

  return (
    <Modal open={jobId != -1} onClose={() => {setJobId(-1);
      setFileName('');
    }}>
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
        <Typography level="title-lg"> {title_sentence} {jobId}</Typography>
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
            logEndpoint={logEndpoint}
            lineAnimationDelay={5}
          />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
