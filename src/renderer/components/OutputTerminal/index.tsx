import { useEffect, useRef, useCallback, useMemo } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Sheet } from '@mui/joy';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetchWithAuth } from '../../lib/authContext';

// Debounce function
const debounce = (func: Function, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const OutputTerminal = ({
  logEndpoint = chatAPI.Endpoints.ServerInfo.StreamLog(),
  lineAnimationDelay = 10,
  initialMessage = '',
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const lineQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useMemo(
    () =>
      debounce(() => {
        if (termRef.current && terminalRef.current && fitAddon.current) {
          // Check if container has dimensions before fitting
          const rect = terminalRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            try {
              // Additional check: ensure terminal element is in DOM and has xterm class
              const xtermElement = terminalRef.current.querySelector('.xterm');
              if (xtermElement) {
                fitAddon.current.fit();
              }
            } catch (error) {
              // Ignore fit errors if dimensions aren't ready yet
              console.warn('FitAddon fit failed:', error);
            }
          }
        }
      }, 300),
    [],
  );

  const processQueue = useCallback(() => {
    if (!termRef.current) return;
    if (lineQueue.current.length === 0) {
      isProcessing.current = false;
      return;
    }

    isProcessing.current = true;
    const line = lineQueue.current.shift()!;
    termRef.current.write(line.replace(/\n$/, '\r\n'));

    timeoutRef.current = setTimeout(() => {
      processQueue();
    }, lineAnimationDelay);
  }, [lineAnimationDelay]);

  const addLinesOneByOne = useCallback(
    (lines: string[]) => {
      lineQueue.current = lineQueue.current.concat(lines);
      if (!isProcessing.current) {
        processQueue();
      }
    },
    [processQueue],
  );

  useEffect(() => {
    termRef.current = new Terminal({
      smoothScrollDuration: 200,
    });
    termRef.current.loadAddon(fitAddon.current);

    if (terminalRef.current) {
      termRef.current.open(terminalRef.current);

      // Delay fit() until container has dimensions
      // Try multiple times with delays to ensure container is visible
      const tryFit = (attempt = 0) => {
        if (terminalRef.current && termRef.current && fitAddon.current) {
          const rect = terminalRef.current.getBoundingClientRect();
          // Check if container has dimensions and terminal element exists
          const xtermElement = terminalRef.current.querySelector('.xterm');
          if (rect.width > 0 && rect.height > 0 && xtermElement) {
            try {
              fitAddon.current.fit();
            } catch (error) {
              // If fit fails and we haven't tried too many times, retry
              if (attempt < 5) {
                setTimeout(() => tryFit(attempt + 1), 100);
              } else {
                console.warn(
                  'Initial FitAddon fit failed after retries:',
                  error,
                );
              }
            }
          } else if (attempt < 10) {
            // Container not visible yet or terminal not initialized, retry after a delay
            setTimeout(() => tryFit(attempt + 1), 100);
          }
        } else if (attempt < 10) {
          setTimeout(() => tryFit(attempt + 1), 100);
        }
      };

      // Start trying to fit after a short delay
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tryFit();
        });
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    termRef.current.writeln(initialMessage);

    let abortController: AbortController | null = new AbortController();
    let isStreaming = true;

    // Use fetchWithAuth instead of EventSource to support authentication
    const startStreaming = async () => {
      try {
        const response = await fetchWithAuth(logEndpoint, {
          signal: abortController?.signal,
        });

        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.error('Stream log request failed:', response.status);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          // eslint-disable-next-line no-console
          console.error('No reader available');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-await-in-loop
        while (isStreaming) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE format: lines starting with "data: " followed by JSON
          const bufferLines = buffer.split('\n');
          buffer = bufferLines.pop() || ''; // Keep incomplete line in buffer

          bufferLines.forEach((line) => {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6); // Remove "data: " prefix
                const logLines = JSON.parse(jsonData);
                if (termRef.current) {
                  addLinesOneByOne(logLines);
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Error parsing SSE data:', e);
              }
            }
          });
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.error('Stream log error:', error);
        }
      }
    };

    startStreaming();

    const currentTerminalRef = terminalRef.current;
    const currentTerm = termRef.current;

    return () => {
      isStreaming = false;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (currentTerm) {
        currentTerm.dispose();
      }
      if (currentTerminalRef) {
        resizeObserver.unobserve(currentTerminalRef);
      }
      resizeObserver.disconnect();
    };
  }, [logEndpoint, initialMessage, addLinesOneByOne, handleResize]);

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

export default OutputTerminal;
