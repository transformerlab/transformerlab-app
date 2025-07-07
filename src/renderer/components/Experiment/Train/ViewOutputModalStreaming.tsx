import useSWR from 'swr';

import {
  Box,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy';

import { useEffect, useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OutputTerminal from 'renderer/components/OutputTerminal';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ViewOutputModalStreaming({
  jobId,
  setJobId,
  sweeps,
  setsweepJob,
}) {
  const [tab, setTab] = useState(0);

  // Poll every 15 seconds to get sweep config until it's loaded
  const [stopPolling, setStopPolling] = useState(false);

  const { data, error, isLoading } = useAPI(
    'train',
    ['getSweepConfig'],
    { job_id: jobId },
    { refreshInterval: stopPolling ? 0 : 15000 },
  );

  if (data && !stopPolling) setStopPolling(true);

  // Reset tab if sweeps is false and tab is not 0
  useEffect(() => {
    if (!sweeps && tab !== 0) {
      setTab(0);
    }
  }, [sweeps, tab]);

  return (
    <Modal
      open={jobId !== -1}
      onClose={() => {
        setJobId(-1);
        setsweepJob(false);
        setTab(0);
      }}
    >
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Output from job: {jobId}
        </Typography>

        <Tabs value={tab} onChange={(_, newVal) => setTab(newVal)}>
          <TabList>
            {sweeps && <Tab>Config</Tab>}
            <Tab>Outputs + Logs</Tab>
          </TabList>

          {sweeps && (
            <TabPanel
              value={0}
              sx={{ py: 2, overflowY: 'auto', maxHeight: '65vh' }}
            >
              {isLoading && (
                <Typography level="body-md" sx={{ color: 'gray' }}>
                  Loading config...
                </Typography>
              )}

              {!isLoading && !data && (
                <Typography level="body-md" sx={{ color: 'orange' }}>
                  Config not available yet. Please wait...
                </Typography>
              )}

              {data && (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.9rem',
                    backgroundColor: '#f5f5f5',
                    padding: '1rem',
                    borderRadius: '8px',
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
            </TabPanel>
          )}

          <TabPanel
            value={sweeps ? 1 : 0}
            sx={{ py: 2, height: '100%', overflow: 'hidden' }}
          >
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
              <OutputTerminal
                logEndpoint={chatAPI.Endpoints.Experiment.StreamOutputFromTrainingJob(
                  jobId,
                  sweeps,
                )}
                lineAnimationDelay={5}
              />
            </Box>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  );
}
