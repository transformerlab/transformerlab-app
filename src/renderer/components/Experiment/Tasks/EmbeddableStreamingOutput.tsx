import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  Tab,
  TabList,
  Tabs,
  Typography,
} from '@mui/joy';
import { RefreshCwIcon } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { jobChipColor } from 'renderer/lib/utils';
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
    // Clear viewport and scrollback buffer, then move cursor to home
    termRef.current.clear();
    termRef.current.write('\x1b[H');
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

const ACTIVE_STATUSES = new Set([
  'RUNNING',
  'LAUNCHING',
  'INTERACTIVE',
  'WAITING',
  'QUEUED',
  'STOPPING',
]);

const OUTPUT_ACTIVE_SEC = 5;
const OUTPUT_IDLE_SEC = 60;
const PROVIDER_ACTIVE_SEC = 10;
const PROVIDER_IDLE_SEC = 60;

function useCountdown(intervalSec: number, isValidating: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSec);
  const wasValidating = useRef(false);

  // Reset countdown when a fetch completes (validating → not validating)
  useEffect(() => {
    if (wasValidating.current && !isValidating) {
      setSecondsLeft(intervalSec);
    }
    wasValidating.current = isValidating;
  }, [isValidating, intervalSec]);

  // Only tick while not validating
  useEffect(() => {
    if (isValidating) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [intervalSec, isValidating]);

  const reset = useCallback(() => setSecondsLeft(intervalSec), [intervalSec]);

  return { secondsLeft, reset };
}

function RefreshIndicator({
  seconds,
  isRefreshing,
  onRefresh,
}: {
  seconds: number;
  isRefreshing: boolean;
  onRefresh?: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography
        level="body-xs"
        sx={{
          color: 'neutral.500',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          userSelect: 'none',
        }}
      >
        {isRefreshing ? (
          <>
            <CircularProgress
              size="sm"
              sx={{
                '--CircularProgress-size': '12px',
                '--CircularProgress-trackThickness': '2px',
                '--CircularProgress-progressThickness': '2px',
              }}
            />
            refreshing…
          </>
        ) : (
          <>refreshing in {seconds}s</>
        )}
      </Typography>
      {onRefresh && !isRefreshing && (
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={onRefresh}
          sx={{ minHeight: 'unset', minWidth: 'unset', p: 0.25 }}
        >
          <RefreshCwIcon size={12} />
        </IconButton>
      )}
    </Box>
  );
}

const TAB_OPTIONS: { value: 'output' | 'provider'; label: string }[] = [
  { value: 'output', label: 'Lab SDK Output' },
  { value: 'provider', label: 'Machine Logs' },
];

export interface EmbeddableStreamingOutputProps {
  jobId: number;
  /** Which tabs to show, in order. e.g. ['output', 'provider'] or ['provider'] for interactive tasks. */
  tabs?: ('output' | 'provider')[];
  /** Current job status string (e.g. 'RUNNING', 'COMPLETE'). Passed from the parent to avoid extra polling. */
  jobStatus?: string;
}

export default function EmbeddableStreamingOutput({
  jobId,
  tabs: tabsProp = ['output', 'provider'],
  jobStatus = '',
}: EmbeddableStreamingOutputProps) {
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

  const storedProviderLogsUrl = useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetProviderLogs(
      experimentInfo.id,
      String(jobId),
      400,
      false,
    );
  }, [experimentInfo?.id, jobId]);

  const liveProviderLogsUrl = useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetProviderLogs(
      experimentInfo.id,
      String(jobId),
      400,
      true,
    );
  }, [experimentInfo?.id, jobId]);

  const [outputIsValidating, setOutputIsValidating] = useState(false);
  const handleOutputValidatingChange = useCallback(
    (v: boolean) => setOutputIsValidating(v),
    [],
  );
  const outputMutateRef = useRef<(() => void) | null>(null);
  const handleOutputMutateReady = useCallback((m: () => void) => {
    outputMutateRef.current = m;
  }, []);

  const isActiveJob = ACTIVE_STATUSES.has(jobStatus);
  const outputRefreshMs = isActiveJob
    ? OUTPUT_ACTIVE_SEC * 1000
    : OUTPUT_IDLE_SEC * 1000;
  const providerRefreshMs = isActiveJob
    ? PROVIDER_ACTIVE_SEC * 1000
    : PROVIDER_IDLE_SEC * 1000;

  const {
    data: storedLogsData,
    isError: storedLogsError,
    isLoading: storedLogsLoading,
    isValidating: storedIsValidating,
    mutate: mutateStoredLogs,
  }: {
    data: any;
    isError: any;
    isLoading: boolean;
    isValidating: boolean;
    mutate: () => void;
  } = useSWR(storedProviderLogsUrl, undefined, {
    refreshInterval: providerRefreshMs,
  });

  const {
    data: liveLogsData,
    isError: liveLogsError,
    isLoading: liveLogsLoading,
    isValidating: liveIsValidating,
    mutate: mutateLiveLogs,
  }: {
    data: any;
    isError: any;
    isLoading: boolean;
    isValidating: boolean;
    mutate: () => void;
  } = useSWR(liveProviderLogsUrl, undefined, {
    refreshInterval: providerRefreshMs,
  });

  const providerLogsData = viewLiveProviderLogs ? liveLogsData : storedLogsData;
  const providerLogsError = viewLiveProviderLogs
    ? liveLogsError
    : storedLogsError;
  const providerLogsLoading = viewLiveProviderLogs
    ? liveLogsLoading
    : storedLogsLoading;
  const providerIsValidating = viewLiveProviderLogs
    ? liveIsValidating
    : storedIsValidating;
  const mutateProviderLogs = viewLiveProviderLogs
    ? mutateLiveLogs
    : mutateStoredLogs;

  const isNoProviderLogsYet =
    providerLogsError && (providerLogsError as any).status === 404;

  const outputCountdownSec = isActiveJob ? OUTPUT_ACTIVE_SEC : OUTPUT_IDLE_SEC;
  const providerCountdownSec = isActiveJob
    ? PROVIDER_ACTIVE_SEC
    : PROVIDER_IDLE_SEC;
  const { secondsLeft: outputCountdown, reset: resetOutputCountdown } =
    useCountdown(outputCountdownSec, outputIsValidating);
  const { secondsLeft: providerCountdown, reset: resetProviderCountdown } =
    useCountdown(providerCountdownSec, providerIsValidating);

  const handleManualRefresh = useCallback(() => {
    if (activeTab === 'output') {
      outputMutateRef.current?.();
      resetOutputCountdown();
    } else {
      mutateProviderLogs();
      resetProviderCountdown();
    }
  }, [
    activeTab,
    mutateProviderLogs,
    resetOutputCountdown,
    resetProviderCountdown,
  ]);

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const providerLogText =
    typeof providerLogsData?.logs === 'string' ? providerLogsData.logs : '';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
      }}
    >
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
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          minHeight: 28,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {jobStatus && (
            <Chip
              size="sm"
              sx={{
                backgroundColor: jobChipColor(jobStatus),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {jobStatus}
            </Chip>
          )}
          {activeTab === 'provider' && (
            <>
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
            </>
          )}
        </Box>
        <RefreshIndicator
          seconds={activeTab === 'output' ? outputCountdown : providerCountdown}
          isRefreshing={
            activeTab === 'output' ? outputIsValidating : providerIsValidating
          }
          onRefresh={handleManualRefresh}
        />
      </Box>
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
              padding: '8px 11px',
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
              refreshInterval={outputRefreshMs}
              initialMessage="Loading job output..."
              onValidatingChange={handleOutputValidatingChange}
              onMutateReady={handleOutputMutateReady}
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
    </Box>
  );
}

EmbeddableStreamingOutput.defaultProps = {
  tabs: ['output', 'provider'],
  jobStatus: '',
};
