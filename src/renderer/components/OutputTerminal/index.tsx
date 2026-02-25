import { useEffect, useRef, useCallback } from 'react';
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentEndpointRef = useRef<string>('');

  const handleResize = debounce(() => {
    if (termRef.current && terminalRef.current && fitAddon.current) {
      const rect = terminalRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        try {
          const xtermElement = terminalRef.current.querySelector('.xterm');
          if (xtermElement) {
            fitAddon.current.fit();
          }
        } catch (error) {
          // Ignore fit errors
        }
      }
    }
  }, 300);

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

  // Initialize terminal once
  useEffect(() => {
    if (!termRef.current) {
      termRef.current = new Terminal({
        smoothScrollDuration: 200,
      });
      termRef.current.loadAddon(fitAddon.current);

      if (terminalRef.current) {
        termRef.current.open(terminalRef.current);

        const tryFit = (attempt = 0) => {
          if (terminalRef.current && termRef.current && fitAddon.current) {
            const rect = terminalRef.current.getBoundingClientRect();
            const xtermElement = terminalRef.current.querySelector('.xterm');
            if (rect.width > 0 && rect.height > 0 && xtermElement) {
              try {
                fitAddon.current.fit();
              } catch (error) {
                if (attempt < 5) {
                  setTimeout(() => tryFit(attempt + 1), 100);
                }
              }
            } else if (attempt < 10) {
              setTimeout(() => tryFit(attempt + 1), 100);
            }
          } else if (attempt < 10) {
            setTimeout(() => tryFit(attempt + 1), 100);
          }
        };

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

      if (initialMessage) {
        termRef.current.writeln(initialMessage);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [initialMessage, handleResize]);

  // Handle streaming - only restart if endpoint actually changed
  useEffect(() => {
    // Only restart if endpoint changed
    if (currentEndpointRef.current === logEndpoint) {
      return;
    }

    // Abort previous stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Update current endpoint
    currentEndpointRef.current = logEndpoint;

    // Clear terminal and queue when switching endpoints
    if (termRef.current) {
      termRef.current.clear();
    }
    lineQueue.current = [];
    isProcessing.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Start new stream
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let isStreaming = true;

    const startStreaming = async () => {
      try {
        const response = await fetchWithAuth(logEndpoint, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (isStreaming) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const bufferLines = buffer.split('\n');
          buffer = bufferLines.pop() || '';

          bufferLines.forEach((line) => {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6);
                const logLines = JSON.parse(jsonData);
                if (
                  termRef.current &&
                  abortControllerRef.current === abortController
                ) {
                  addLinesOneByOne(logLines);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          });
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // Stream error (not abort)
        }
      }
    };

    startStreaming();

    return () => {
      isStreaming = false;
      if (abortControllerRef.current === abortController) {
        abortController.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [logEndpoint, addLinesOneByOne]);

  // Cleanup terminal on unmount
  useEffect(() => {
    return () => {
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
