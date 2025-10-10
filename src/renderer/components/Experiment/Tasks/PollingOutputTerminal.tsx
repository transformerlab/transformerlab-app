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

    if (initialMessage) {
      termRef.current.writeln(initialMessage);
    }

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

    // Process new content when data changes
    if (outputData && Array.isArray(outputData)) {
      const currentLines = outputData.join('\n');
      if (currentLines !== lastContent) {
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
            termRef.current.clear();
          }
          addLinesOneByOne(outputData);
        }

        setLastContent(currentLines);
      }
    }

    // Handle errors
    if (error) {
      const errorMessage = `Error fetching output: ${error.message}`;
      addLinesOneByOne([errorMessage]);
    }
  }, [outputData, lastContent, error]);

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
