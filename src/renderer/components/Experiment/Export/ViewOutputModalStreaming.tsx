import { useEffect, useMemo } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { API_URL } from 'renderer/lib/api-client/urls';
import OutputTerminal from 'renderer/components/OutputTerminal';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

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
  const { experimentInfo } = useExperimentInfo();

  const jobDetailsUrl =
    experimentInfo && jobId && jobId !== -1
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, jobId)
      : null;

  const { data: jobDetails } = useSWR<JobDetails>(jobDetailsUrl, fetcher, {
    refreshInterval: 2000,
  });

  // Memoize the outputEndpoint to prevent OutputTerminal from reinitializing on every render
  const outputEndpoint = useMemo(
    () =>
      experimentInfo
        ? chatAPI.Endpoints.Experiment.StreamOutputFromJob(
            experimentInfo.id,
            jobId,
          )
        : null,
    [experimentInfo?.id, jobId],
  );

  if (!experimentInfo) return null;

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
