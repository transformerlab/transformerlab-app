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
      console.log('PollingOutputTerminal: handleResize called');
      if (termRef.current) {
        console.log('PollingOutputTerminal: Calling fit() from handleResize');
        fitAddon.current.fit();
        console.log('PollingOutputTerminal: fit() completed in handleResize');
      } else {
        console.log('PollingOutputTerminal: termRef.current is null in handleResize');
      }
    }, 300),
    []
  );

  const processQueue = () => {
    console.log('PollingOutputTerminal: processQueue called');
    console.log('PollingOutputTerminal: termRef.current exists:', !!termRef.current);
    console.log('PollingOutputTerminal: lineQueue length:', lineQueue.current.length);

    if (!termRef.current) {
      console.log('PollingOutputTerminal: termRef.current is null in processQueue');
      return;
    }
    if (lineQueue.current.length === 0) {
      console.log('PollingOutputTerminal: lineQueue is empty, stopping processing');
      isProcessing.current = false;
      return;
    }

    isProcessing.current = true;
    const line = lineQueue.current.shift()!;
    console.log('PollingOutputTerminal: Writing line to terminal:', line);

    try {
      termRef.current.write(line.replace(/\n$/, '\r\n'));
      console.log('PollingOutputTerminal: Line written successfully');
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
  const outputEndpoint = chatAPI.Endpoints.Experiment.GetTasksOutputFromJob(experimentId, jobId.toString());

  const { data: outputData, error } = useSWR(
    outputEndpoint,
    async (url: string) => {
      const response = await chatAPI.authenticatedFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    },
    {
      refreshInterval: refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  // Terminal initialization (only once)
  useEffect(() => {
    console.log('PollingOutputTerminal: Starting terminal initialization');

    termRef.current = new Terminal({
      smoothScrollDuration: 200,
    });
    console.log('PollingOutputTerminal: Terminal created');

    termRef.current.loadAddon(fitAddon.current);
    console.log('PollingOutputTerminal: FitAddon loaded');

    if (terminalRef.current) {
      console.log('PollingOutputTerminal: Opening terminal in DOM element');
      termRef.current.open(terminalRef.current);
      console.log('PollingOutputTerminal: Terminal opened');
    }

    console.log('PollingOutputTerminal: Calling fit()');
    fitAddon.current.fit();
    console.log('PollingOutputTerminal: fit() completed');

    const resizeObserver = new ResizeObserver(() => {
      console.log('PollingOutputTerminal: ResizeObserver triggered');
      handleResize();
    });

    if (terminalRef.current) {
      console.log('PollingOutputTerminal: Setting up ResizeObserver');
      resizeObserver.observe(terminalRef.current);
    }

    if (initialMessage) {
      console.log('PollingOutputTerminal: Writing initial message:', initialMessage);
      termRef.current.writeln(initialMessage);
    }

    console.log('PollingOutputTerminal: Terminal initialization complete');

    return () => {
      console.log('PollingOutputTerminal: Cleaning up terminal');
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
    console.log('PollingOutputTerminal: Data processing useEffect triggered');
    console.log('PollingOutputTerminal: termRef.current exists:', !!termRef.current);
    console.log('PollingOutputTerminal: outputData:', outputData);
    console.log('PollingOutputTerminal: lastContent:', lastContent);
    console.log('PollingOutputTerminal: error:', error);

    if (!termRef.current) {
      console.log('PollingOutputTerminal: termRef.current is null, returning early');
      return;
    }

    const addLinesOneByOne = (lines: string[]) => {
      console.log('PollingOutputTerminal: addLinesOneByOne called with lines:', lines);
      lineQueue.current = lineQueue.current.concat(lines);
      if (!isProcessing.current) {
        console.log('PollingOutputTerminal: Starting processQueue');
        processQueue();
      }
    };

    // Process new content when data changes
    if (outputData && outputData !== lastContent) {
      console.log('PollingOutputTerminal: Processing new output data');
      // Only process new lines (content that wasn't there before)
      if (lastContent) {
        const newContent = outputData.slice(lastContent.length);
        console.log('PollingOutputTerminal: New content:', newContent);
        if (newContent.trim()) {
          const newLines = newContent.split('\n').filter(line => line.trim());
          console.log('PollingOutputTerminal: New lines to add:', newLines);
          addLinesOneByOne(newLines);
        }
      } else {
        // First time - clear the loading message and add all content
        if (termRef.current) {
          console.log('PollingOutputTerminal: Clearing terminal for first content');
          termRef.current.clear();
        }
        const lines = outputData.split('\n').filter(line => line.trim());
        console.log('PollingOutputTerminal: First time, adding all lines:', lines);
        addLinesOneByOne(lines);
      }

      setLastContent(outputData);
    }

    // Handle errors
    if (error) {
      console.log('PollingOutputTerminal: Handling error:', error);
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
