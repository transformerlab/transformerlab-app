import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Tab,
  TabList,
  Tabs,
  Typography,
} from '@mui/joy';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import PollingOutputTerminal from './PollingOutputTerminal';

interface ProviderLogsTerminalProps {
  logsText: string;
}

const ProviderLogsTerminal: React.FC<ProviderLogsTerminalProps> = ({
  logsText,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: '#000000',
      },
      smoothScrollDuration: 150,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    fitAddonRef.current = fit;

    if (containerRef.current) {
      term.open(containerRef.current);
      fit.fit();
    }

    termRef.current = term;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore resize errors
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!termRef.current) return;

    const text = logsText || 'No provider log data yet.';
    // Clear screen and move cursor to home
    termRef.current.write('\x1b[2J\x1b[H');
    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    lines.forEach((line) => {
      termRef.current!.writeln(line);
    });
  }, [logsText]);

  return (
    <Box
      sx={{
        flex: 1,
        borderRadius: '8px',
        border: '1px solid #333',
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
      ref={containerRef}
    />
  );
};

interface ViewOutputModalStreamingProps {
  jobId: number;
  setJobId: (jobId: number) => void;
}

export default function ViewOutputModalStreaming({
  jobId,
  setJobId,
}: ViewOutputModalStreamingProps) {
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

  const {
    data: providerLogsData,
    isError: providerLogsError,
    isLoading: providerLogsLoading,
  }: {
    data: any;
    isError: any;
    isLoading: boolean;
  } = useSWR(providerLogsUrl);

  const isNoProviderLogsYet =
    providerLogsError && (providerLogsError as any).status === 404;

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
        >
          <TabList>
            <Tab value="output">Task Output</Tab>
            <Tab value="provider">Provider Logs</Tab>
          </TabList>
        </Tabs>
        <Box
          sx={{
            mt: 1,
            flex: 1,
            minHeight: 0,
            width: '100%',
            display: 'flex',
          }}
        >
          {activeTab === 'output' ? (
            <Box
              sx={{
                borderRadius: '8px',
                border: '1px solid #444',
                padding: '0 0 0 0.5rem',
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
          ) : (
            <>
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
              {isNoProviderLogsYet && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                  }}
                >
                  <Alert
                    color="neutral"
                    variant="soft"
                    sx={{ maxWidth: '600px', width: '100%' }}
                  >
                    No provider logs are available for this job yet. The cluster
                    may not have started or may have already been destroyed.
                    Please try again later.
                  </Alert>
                </Box>
              )}
              {!providerLogsLoading &&
                providerLogsError &&
                !isNoProviderLogsYet && (
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 2,
                    }}
                  >
                    <Alert
                      color="danger"
                      variant="soft"
                      sx={{ maxWidth: '600px', width: '100%' }}
                    >
                      {providerLogsError.message}
                    </Alert>
                  </Box>
                )}
              {!providerLogsLoading && !providerLogsError && (
                <ProviderLogsTerminal logsText={providerLogText} />
              )}
            </>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}
