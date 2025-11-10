import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Sheet } from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

interface PollingOutputTerminalProps {
  jobId: number;
  experimentId: string;
  lineAnimationDelay?: number;
  initialMessage?: string;
  refreshInterval?: number;
}

const PollingOutputTerminal: React.FC<PollingOutputTerminalProps> = ({
  jobId,
  experimentId,
  lineAnimationDelay = 10,
  initialMessage = '',
  refreshInterval = 2000, // Poll every 2 seconds
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const lineQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastContent, setLastContent] = useState<string>('');
  const [hasReceivedData, setHasReceivedData] = useState(false);

  const handleResize = useCallback(
    debounce(() => {
      if (termRef.current) {
        fitAddon.current.fit();
      }
    }, 300),
    [],
  );

  const processQueue = () => {
    if (!termRef.current) return;
    if (lineQueue.current.length === 0) {
      isProcessing.current = false;
      return;
    }

    isProcessing.current = true;
    const line = lineQueue.current.shift()!;

    try {
      // Write the line and add a newline
      termRef.current.write(line + '\r\n');
    } catch (error) {
      console.error('PollingOutputTerminal: Error writing to terminal:', error);
    }

    if (terminalRef.current) {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    timeoutRef.current = setTimeout(() => {
      processQueue();
    }, lineAnimationDelay);
  };

  // Fetch the output file content directly using the Tasks-specific endpoint
  const outputEndpoint = chatAPI.Endpoints.Experiment.GetTasksOutputFromJob(
    experimentId,
    jobId.toString(),
  );

  const { data: outputData, error } = useSWR(
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

  // Reset state when jobId changes
  useEffect(() => {
    setLastContent('');
    setHasReceivedData(false);
  }, [jobId]);

  // Terminal initialization (only once)
  useEffect(() => {
    termRef.current = new Terminal({
      smoothScrollDuration: 200,
    });
    termRef.current.loadAddon(fitAddon.current);

    if (terminalRef.current) {
      termRef.current.open(terminalRef.current);
    }

    fitAddon.current.fit();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Don't write initial message here - let the data processing effect handle it
    // This prevents showing "Loading..." when data is already available (cached)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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

    const addLinesOneByOne = (lines: string[]) => {
      lineQueue.current = lineQueue.current.concat(lines);
      if (!isProcessing.current) {
        processQueue();
      }
    };

    // Show loading message only if we don't have data yet and haven't shown anything
    if (!outputData && !error && !hasReceivedData && initialMessage) {
      termRef.current.write(initialMessage + '\r\n');
      return;
    }

    // Process new content when data changes
    if (outputData) {
      // Handle case where API returns a string instead of array
      if (typeof outputData === 'string') {
        if (!hasReceivedData && termRef.current) {
          // Use ANSI escape sequences to completely clear the screen and move cursor to top
          termRef.current.write('\x1b[2J\x1b[H');
          setHasReceivedData(true);
          addLinesOneByOne([outputData]);
        }
        return;
      }

      // Handle array responses
      if (Array.isArray(outputData)) {
        // Check if output is empty or indicates no output found
        const isEmptyOutput =
          outputData.length === 0 ||
          (outputData.length === 1 &&
            outputData[0] === 'Output file not found');

        if (isEmptyOutput && !hasReceivedData) {
          // First response indicates no output - clear loading message and show user-friendly message immediately
          if (termRef.current) {
            const noOutputMessage =
              'No output found, make sure your script ran correctly and made use of the transformerlab package for the output to be visible.';
            // Use ANSI escape sequences to completely clear the screen and move cursor to top
            // This must happen synchronously to prevent the loading message from showing
            termRef.current.write('\x1b[2J\x1b[H' + noOutputMessage + '\r\n');
            setHasReceivedData(true);
            setLastContent(noOutputMessage);
          }
          return;
        }

        const currentLines = outputData.join('\n');
        if (currentLines !== lastContent) {
          // If we previously showed "No output found" and now have actual output, clear and show it
          const noOutputMessage =
            'No output found, make sure your script ran correctly and made use of the transformerlab package for the output to be visible.';
          if (lastContent === noOutputMessage && !isEmptyOutput) {
            // Transitioning from "No output found" to actual output - clear and show new content
            if (termRef.current) {
              // Use ANSI escape sequences to completely clear the screen and move cursor to top
              termRef.current.write('\x1b[2J\x1b[H');
            }
            addLinesOneByOne(outputData);
            setLastContent(currentLines);
            return;
          }

          // Only process new lines (content that wasn't there before)
          if (lastContent) {
            const newContent = currentLines.slice(lastContent.length);
            if (newContent.trim()) {
              // Split new content by newlines
              const newLines = newContent
                .split('\n')
                .filter((line) => line.trim());
              addLinesOneByOne(newLines);
            }
          } else {
            // First time - clear the loading message and add all content
            if (termRef.current) {
              // Use ANSI escape sequences to completely clear the screen and move cursor to top
              termRef.current.write('\x1b[2J\x1b[H');
              setHasReceivedData(true);
            }
            // Only add lines if there's actual content (not empty or error message)
            if (!isEmptyOutput) {
              addLinesOneByOne(outputData);
            }
          }

          setLastContent(currentLines);
        }
      }
    }

    // Handle errors
    if (error) {
      if (termRef.current && !hasReceivedData) {
        // Use ANSI escape sequences to completely clear the screen and move cursor to top
        termRef.current.write('\x1b[2J\x1b[H');
        setHasReceivedData(true);
      }
      const errorMessage = `Error fetching output: ${error.message}`;
      addLinesOneByOne([errorMessage]);
    }
  }, [outputData, lastContent, error, hasReceivedData]);

  return (
    <Sheet
      sx={{
        overflow: 'auto',
        backgroundColor: '#000',
        color: '#aaa',
        height: '100%',
      }}
      ref={terminalRef}
    >
      &nbsp;
    </Sheet>
  );
};

export default PollingOutputTerminal;
