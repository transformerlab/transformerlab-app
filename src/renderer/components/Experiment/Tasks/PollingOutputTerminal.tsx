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
  const termOpenedRef = useRef(false);
  const [lastLineCount, setLastLineCount] = useState<number>(0);
  const [hasReceivedData, setHasReceivedData] = useState(false);

  // Helper: safely call a terminal method, ignoring errors if render service isn't ready
  const safeTerm = useCallback((fn: (term: Terminal) => void) => {
    if (!termRef.current) return;
    try {
      fn(termRef.current);
    } catch {
      // ignore — render service may not be initialized (zero-dimension container)
    }
  }, []);

  const handleResize = useCallback(
    debounce(() => {
      if (termRef.current && termOpenedRef.current) {
        try {
          fitAddon.current.fit();
        } catch {
          // ignore — render service may not be ready yet
        }
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
    safeTerm((term) => {
      requestAnimationFrame(() => {
        if (termRef.current) {
          termRef.current.reset();
        }
      });
    });
  }, [jobId, safeTerm]);

  // Terminal initialization (only once)
  useEffect(() => {
    const term = new Terminal({
      smoothScrollDuration: 0,
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'block',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
    });
    term.loadAddon(fitAddon.current);
    termRef.current = term;

    // Defer open() until the container has non-zero dimensions.
    // Opening xterm on a zero-dimension element (e.g. inside a modal that
    // hasn't animated in yet) leaves the render service uninitialized and
    // causes "Cannot read properties of undefined (reading 'dimensions')"
    // on any subsequent write/reset/scroll operation.
    const tryOpen = () => {
      if (!terminalRef.current || termOpenedRef.current) return;
      const rect = terminalRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        term.open(terminalRef.current);
        termOpenedRef.current = true;
        try {
          fitAddon.current.fit();
        } catch {
          // ignore
        }
      }
    };

    tryOpen();

    const resizeObserver = new ResizeObserver(() => {
      // If terminal hasn't been opened yet, try now that container may have dimensions
      if (!termOpenedRef.current) {
        tryOpen();
      }
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      term.dispose();
      termRef.current = null;
      termOpenedRef.current = false;
      if (terminalRef.current) {
        resizeObserver.unobserve(terminalRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []); // Only run once on mount

  // Data processing (separate useEffect)
  useEffect(() => {
    if (!termRef.current || !termOpenedRef.current) return;

    // Show loading message only if we don't have data yet and haven't shown anything
    if (!outputData && !error && !hasReceivedData && initialMessage) {
      safeTerm((term) => {
        term.reset();
        term.write(initialMessage + '\r\n');
      });
      return;
    }

    // Process new content when data changes
    if (outputData) {
      // Handle case where API returns a string instead of array
      if (typeof outputData === 'string') {
        if (!hasReceivedData) {
          safeTerm((term) => term.reset());
          setHasReceivedData(true);
        }
        safeTerm((term) => term.write(outputData + '\r\n'));
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
          safeTerm((term) => {
            term.reset();
            term.write(
              'No output found, make sure your script ran correctly and made use of the transformerlab package for the output to be visible.\r\n',
            );
          });
          setHasReceivedData(true);
          setLastLineCount(0);
          return;
        }

        if (isEmptyOutput) return;

        const currentLineCount = outputData.length;

        if (currentLineCount !== lastLineCount) {
          if (!hasReceivedData || lastLineCount === 0) {
            // First data or transitioning from empty — write everything at once
            safeTerm((term) => {
              term.reset();
              const batch = outputData.join('\r\n') + '\r\n';
              term.write(batch);
            });
            setHasReceivedData(true);
          } else if (currentLineCount > lastLineCount) {
            // Incremental update — only write new lines
            const newLines = outputData.slice(lastLineCount);
            const batch = newLines.join('\r\n') + '\r\n';
            safeTerm((term) => term.write(batch));
          } else {
            // Content changed in a non-append way (e.g. file was rewritten)
            safeTerm((term) => {
              term.reset();
              const batch = outputData.join('\r\n') + '\r\n';
              term.write(batch);
            });
          }

          safeTerm((term) => term.scrollToBottom());
          setLastLineCount(currentLineCount);
        }
      }
    }

    // Handle errors
    if (error) {
      if (!hasReceivedData) {
        safeTerm((term) => term.reset());
        setHasReceivedData(true);
      }
      safeTerm((term) =>
        term.write(`Error fetching output: ${error.message}\r\n`),
      );
    }
  }, [
    outputData,
    lastLineCount,
    error,
    hasReceivedData,
    initialMessage,
    safeTerm,
  ]);

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
