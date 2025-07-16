import { useEffect } from 'react';
import useSWR from 'swr';

import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { API_URL } from 'renderer/lib/api-client/urls';
import OutputTerminal from 'renderer/components/OutputTerminal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ViewOutputModalStreamingProps {
  jobId: string | number;
  setJobId: (id: string | number) => void;
}

interface JobDetails {
  id: string;
  type?: string;
  experiment_id?: number;
  job_data?: {
    plugin_id?: string;
    experiment_id?: number;
    exporter_name?: string;
    plugin?: string;
  };
}

export default function ViewOutputModalStreaming({
  jobId,
  setJobId,
}: ViewOutputModalStreamingProps) {
  const { data: jobDetails } = useSWR<JobDetails>(
    jobId && jobId !== -1 ? chatAPI.Endpoints.Jobs.Get(jobId) : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  // // Create a custom endpoint for export job output
  const outputEndpoint =
    chatAPI.Endpoints.Experiment.StreamOutputFromJob(jobId);

  return (
    <Modal open={jobId !== -1} onClose={() => setJobId(-1)}>
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
          <OutputTerminal logEndpoint={outputEndpoint} lineAnimationDelay={5} />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
