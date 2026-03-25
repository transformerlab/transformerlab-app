import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Sheet } from '@mui/joy';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

interface PollingOutputTerminalProps {
  jobId: string | number;
  experimentId: string;
  lineAnimationDelay?: number;
  initialMessage?: string;
  refreshInterval?: number;
  onValidatingChange?: (isValidating: boolean) => void;
  onMutateReady?: (mutate: () => void) => void;
}

const PollingOutputTerminal: React.FC<PollingOutputTerminalProps> = ({
  jobId,
  experimentId,
  initialMessage = '',
  refreshInterval = 2000, // Poll every 2 seconds
  onValidatingChange,
  onMutateReady,
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const [lastLineCount, setLastLineCount] = useState<number>(0);
  const [hasReceivedData, setHasReceivedData] = useState(false);

  const handleResize = useCallback(
    debounce(() => {
      if (termRef.current) {
        fitAddon.current.fit();
      }
    }, 300),
    [],
  );

  // Fetch the output file content directly using the Tasks-specific endpoint
  const outputEndpoint = chatAPI.Endpoints.Experiment.GetTasksOutputFromJob(
    experimentId,
    String(jobId),
  );

  const {
    data: outputData,
    error,
    isValidating,
    mutate,
  } = useSWR(
    outputEndpoint,
    async (url: string) => {
      const response = await chatAPI.authenticatedFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    {
      refreshInterval: refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    },
  );

  useEffect(() => {
    onValidatingChange?.(isValidating);
  }, [isValidating, onValidatingChange]);

  useEffect(() => {
    onMutateReady?.(() => mutate());
  }, [mutate, onMutateReady]);

  // Reset state when jobId changes
  useEffect(() => {
    setLastLineCount(0);
    setHasReceivedData(false);
    if (termRef.current) {
      requestAnimationFrame(() => {
        if (termRef.current) {
          termRef.current.reset();
        }
      });
    }
  }, [jobId]);

  // Terminal initialization (only once)
  useEffect(() => {
    termRef.current = new Terminal({
      smoothScrollDuration: 0,
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'block',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
    });
    termRef.current.loadAddon(fitAddon.current);

    if (terminalRef.current) {
      termRef.current.open(terminalRef.current);
      termRef.current.reset();
    }

    fitAddon.current.fit();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      termRef.current?.dispose();
      termRef.current = null;
      if (terminalRef.current) {
        resizeObserver.unobserve(terminalRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []); // Only run once on mount

  // Data processing (separate useEffect)
  useEffect(() => {
    if (!termRef.current) return;

    // Show loading message only if we don't have data yet and haven't shown anything
    if (!outputData && !error && !hasReceivedData && initialMessage) {
      termRef.current.reset();
      termRef.current.write(initialMessage + '\r\n');
      return;
    }

    // Process new content when data changes
    if (outputData) {
      // Handle case where API returns a string instead of array
      if (typeof outputData === 'string') {
        if (!hasReceivedData) {
          termRef.current.reset();
          setHasReceivedData(true);
        }
        termRef.current.write(outputData + '\r\n');
        setLastLineCount(1);
        return;
      }

      // Handle array responses
      if (Array.isArray(outputData)) {
        const isEmptyOutput =
          outputData.length === 0 ||
          (outputData.length === 1 &&
            outputData[0] === 'Output file not found');

        if (isEmptyOutput && !hasReceivedData) {
          termRef.current.reset();
          termRef.current.write(
            'No output found, make sure your script ran correctly and made use of the transformerlab package for the output to be visible.\r\n',
          );
          setHasReceivedData(true);
          setLastLineCount(0);
          return;
        }

        if (isEmptyOutput) return;

        const currentLineCount = outputData.length;

        if (currentLineCount !== lastLineCount) {
          if (!hasReceivedData || lastLineCount === 0) {
            // First data or transitioning from empty — write everything at once
            termRef.current.reset();
            setHasReceivedData(true);
            // Batch all lines into a single write for performance
            const batch = outputData.join('\r\n') + '\r\n';
            termRef.current.write(batch);
          } else if (currentLineCount > lastLineCount) {
            // Incremental update — only write new lines
            const newLines = outputData.slice(lastLineCount);
            const batch = newLines.join('\r\n') + '\r\n';
            termRef.current.write(batch);
          } else {
            // Content changed in a non-append way (e.g. file was rewritten)
            termRef.current.reset();
            const batch = outputData.join('\r\n') + '\r\n';
            termRef.current.write(batch);
          }

          termRef.current.scrollToBottom();
          setLastLineCount(currentLineCount);
        }
      }
    }

    // Handle errors
    if (error) {
      if (!hasReceivedData) {
        termRef.current.reset();
        setHasReceivedData(true);
      }
      termRef.current.write(`Error fetching output: ${error.message}\r\n`);
    }
  }, [outputData, lastLineCount, error, hasReceivedData, initialMessage]);

  return (
    <Sheet
      sx={{
        overflow: 'auto',
        backgroundColor: '#000',
        color: '#aaa',
        height: '100%',
      }}
      ref={terminalRef}
    />
  );
};

export default PollingOutputTerminal;
