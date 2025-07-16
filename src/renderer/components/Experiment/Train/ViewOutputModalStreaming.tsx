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
  if (jobId === -1) {
    return null;
  }
  const [tab, setTab] = useState(0);
  // Poll every 15 seconds to get sweep config until it's loaded
  const [stopPolling, setStopPolling] = useState(false);

  const { data, error, isLoading } = useAPI(
    'train',
    ['getSweepResults'],
    { job_id: jobId },
    { refreshInterval: stopPolling ? 0 : 15000, enabled: jobId !== -1 },
  );

  if (data && !stopPolling) setStopPolling(true);

  // Reset tab if sweeps is false and tab is not 0
  useEffect(() => {
    if (!sweeps && tab !== 0) {
      setTab(0);
    }
  }, [sweeps, tab]);

  const renderResults = (results) => {
    if (!results || typeof results !== 'object') {
      return (
        <Typography level="body-md" sx={{ color: 'gray' }}>
          No results to display.
        </Typography>
      );
    }

    return (
      <Box
        sx={{
          fontSize: '0.9rem',
          backgroundColor: '#f5f5f5',
          padding: '1rem',
          borderRadius: '8px',
          overflowY: 'auto',
        }}
      >
        {Object.entries(results).map(([key, value]) => (
          <Box key={key} sx={{ mb: 1 }}>
            <strong>{key}</strong>: {JSON.stringify(value)}
          </Box>
        ))}
      </Box>
    );
  };

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
            {sweeps && <Tab>Results</Tab>}
            <Tab>Raw Output</Tab>
          </TabList>

          {sweeps && (
            <TabPanel
              value={0}
              sx={{ py: 2, overflowY: 'auto', maxHeight: '65vh' }}
            >
              {isLoading && (
                <Typography level="body-md" sx={{ color: 'gray' }}>
                  Loading results...
                </Typography>
              )}

              {!isLoading && data?.status === 'error' && (
                <Typography level="body-md" sx={{ color: 'red' }}>
                  {data.message}
                </Typography>
              )}

              {!isLoading &&
                data?.status === 'success' &&
                renderResults(data.data)}
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
                logEndpoint={chatAPI.Endpoints.Experiment.StreamOutputFromJob(
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
