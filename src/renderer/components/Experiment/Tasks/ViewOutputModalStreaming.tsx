import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from '@mui/joy';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import PollingOutputTerminal from './PollingOutputTerminal';

export default function ViewOutputModalStreaming({ jobId, setJobId }) {
  const { experimentInfo } = useExperimentInfo();
  const [activeTab, setActiveTab] = useState<'output' | 'provider'>('output');

  useEffect(() => {
    setActiveTab('output');
  }, [jobId]);

  const providerLogsUrl = useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetProviderLogs(
      experimentInfo.id,
      String(jobId),
    );
  }, [experimentInfo?.id, jobId]);

  const fetchProviderLogs = async (url: string) => {
    const response = await chatAPI.authenticatedFetch(url);
    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed?.detail || text || `HTTP ${response.status}`);
      } catch {
        throw new Error(text || `HTTP ${response.status}`);
      }
    }
    return response.json();
  };

  const {
    data: providerLogsData,
    error: providerLogsError,
    isLoading: providerLogsLoading,
  } = useSWR(providerLogsUrl, fetchProviderLogs, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const providerLogText =
    typeof providerLogsData?.logs === 'string' ? providerLogsData.logs : '';

  return (
    <Modal
      open={jobId !== -1}
      onClose={() => {
        setJobId(-1);
      }}
    > 
      <ModalDialog
        sx={{
          width: '80vw',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Output from job: {jobId}
        </Typography>
        <Tabs
          value={activeTab}
          onChange={(_event, value) => {
            if (typeof value === 'string') {
              setActiveTab(value as 'output' | 'provider');
            }
          }}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <TabList>
            <Tab value="output">Task Output</Tab>
            <Tab value="provider">Provider Logs</Tab>
          </TabList>
          <TabPanel
            value="output"
            sx={{ flex: 1, display: 'flex', p: 0, pt: 1, minHeight: 0 }}
          >
            <Box
              sx={{
                border: '10px solid #444',
                padding: '0rem 0 0 1rem',
                backgroundColor: '#000',
                width: '100%',
                flex: 1,
                minHeight: 0,
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
          </TabPanel>
          <TabPanel
            value="provider"
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 0,
              pt: 1,
              minHeight: 0,
            }}
          >
            {providerLogsLoading && (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CircularProgress size="sm" />
              </Box>
            )}
            {providerLogsError && (
              <Alert color="danger" variant="soft">
                {providerLogsError.message}
              </Alert>
            )}
            {!providerLogsLoading && !providerLogsError && (
              <>
                <Typography level="body-sm" color="neutral">
                  {providerLogsData
                    ? `Cluster ${providerLogsData.cluster_name} • Provider job ${providerLogsData.provider_job_id}`
                    : 'Job logs will appear once available from the provider.'}
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    borderRadius: '8px',
                    border: '1px solid #333',
                    backgroundColor: '#050505',
                    color: '#d7d7d7',
                    overflow: 'auto',
                    fontFamily: 'JetBrains Mono, "Fira Code", monospace',
                    fontSize: '0.85rem',
                    p: 1,
                  }}
                >
                  <Typography
                    component="pre"
                    sx={{
                      m: 0,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                    }}
                  >
                    {providerLogText.trim()
                      ? providerLogText
                      : 'No provider log data yet.'}
                  </Typography>
                </Box>
              </>
            )}
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  );
}
