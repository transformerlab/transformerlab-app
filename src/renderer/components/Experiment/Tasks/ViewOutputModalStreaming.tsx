import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Checkbox,
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
import '@xterm/xterm/css/xterm.css';
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

const TAB_OPTIONS: { value: 'output' | 'provider'; label: string }[] = [
  { value: 'output', label: 'Task Output' },
  { value: 'provider', label: 'Provider Logs' },
];

interface ViewOutputModalStreamingProps {
  jobId: number;
  setJobId: (jobId: number) => void;
  /** Which tabs to show, in order. e.g. ['output', 'provider'] or ['provider'] for interactive tasks. */
  tabs?: ('output' | 'provider')[];
}

function ViewOutputModalStreaming({
  jobId,
  setJobId,
  tabs: tabsProp = ['output', 'provider'],
}: ViewOutputModalStreamingProps) {
  const { experimentInfo } = useExperimentInfo();
  const [activeTab, setActiveTab] = useState<'output' | 'provider'>('output');
  const [viewLiveProviderLogs, setViewLiveProviderLogs] =
    useState<boolean>(false);

  const tabs = tabsProp.length > 0 ? tabsProp : ['output', 'provider'];
  const showTabList = tabs.length > 1;
  const tabsKey = tabs.join(',');

  useEffect(() => {
    setActiveTab((current) =>
      tabs.includes(current)
        ? current
        : ((tabs[0] ?? 'output') as 'output' | 'provider'),
    );
    setViewLiveProviderLogs(false);
    // tabsKey is a stable serialization of tabs to avoid array reference churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, tabsKey]);

  const providerLogsUrl = useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetProviderLogs(
      experimentInfo.id,
      String(jobId),
      400,
      viewLiveProviderLogs,
    );
  }, [experimentInfo?.id, jobId, viewLiveProviderLogs]);

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
          {`${
            showTabList
              ? 'Output from job'
              : (TAB_OPTIONS.find((t) => t.value === tabs[0])?.label ??
                'Output')
          }: ${jobId}`}
        </Typography>
        {showTabList && (
          <Tabs
            value={activeTab}
            onChange={(_event, value) => {
              if (
                typeof value === 'string' &&
                (value === 'output' || value === 'provider')
              ) {
                setActiveTab(value);
              }
            }}
          >
            <TabList>
              {tabs.map((tabValue) => {
                const option = TAB_OPTIONS.find((t) => t.value === tabValue);
                return option ? (
                  <Tab key={tabValue} value={tabValue}>
                    {option.label}
                  </Tab>
                ) : null;
              })}
            </TabList>
          </Tabs>
        )}
        {activeTab === 'provider' && (
          <Box
            sx={{
              mt: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Checkbox
              size="sm"
              checked={viewLiveProviderLogs}
              onChange={(event) =>
                setViewLiveProviderLogs(!!event.target.checked)
              }
              label="View live provider logs"
            />
            {viewLiveProviderLogs && (
              <Typography level="body-xs" color="warning">
                Live logs are fetched directly from the remote machine and may
                disappear once the machine stops running.
              </Typography>
            )}
          </Box>
        )}
        <Box
          sx={{
            mt: activeTab === 'provider' ? 0.5 : 1,
            flex: 1,
            minHeight: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tabs.includes('output') && activeTab === 'output' ? (
            <Box
              sx={{
                padding: 0,
                backgroundColor: '#000',
                width: '100%',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '8px',
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
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#000',
                borderRadius: '8px',
                padding: '8px 11px',
                gap: 1,
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
            </Box>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}

ViewOutputModalStreaming.defaultProps = {
  tabs: ['output', 'provider'],
};

export default ViewOutputModalStreaming;
