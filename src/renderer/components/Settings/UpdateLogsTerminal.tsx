import React, { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Sheet } from '@mui/joy';
import { fetchWithAuth } from 'renderer/lib/authContext';
import { Endpoints } from 'renderer/lib/transformerlab-api-sdk';
import '@xterm/xterm/css/xterm.css';

const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

interface UpdateLogsTerminalProps {
  isActive: boolean;
  lineAnimationDelay?: number;
}

const UpdateLogsTerminal: React.FC<UpdateLogsTerminalProps> = ({
  isActive,
  lineAnimationDelay = 5,
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const lineQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleResize = useCallback(
    debounce(() => {
      if (termRef.current && terminalRef.current && fitAddon.current) {
        const rect = terminalRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          try {
            const xtermElement = terminalRef.current.querySelector('.xterm');
            if (xtermElement) {
              fitAddon.current.fit();
            }
          } catch (error) {
            console.warn('FitAddon fit failed:', error);
          }
        }
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
      termRef.current.write(line + '\r\n');
    } catch (error) {
      console.error('UpdateLogsTerminal: Error writing to terminal:', error);
    }

    if (terminalRef.current) {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    timeoutRef.current = setTimeout(() => {
      processQueue();
    }, lineAnimationDelay);
  };

  // Terminal initialization
  useEffect(() => {
    if (!terminalRef.current) return;

    termRef.current = new Terminal({
      convertEol: true,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
      smoothScrollDuration: 150,
    });
    termRef.current.loadAddon(fitAddon.current);
    termRef.current.open(terminalRef.current);

    // Write initial message
    termRef.current.writeln('Waiting for update logs...\r');

    // Fit terminal to container
    setTimeout(() => {
      fitAddon.current.fit();
    }, 100);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
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
  }, []);

  // Stream logs from server
  useEffect(() => {
    if (!isActive) return;

    // Wait a bit for terminal to initialize
    const timeoutId = setTimeout(() => {
      if (!termRef.current) {
        console.warn('Terminal not initialized yet');
        return;
      }

      const startStreaming = async () => {
        // Cancel any existing stream
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        try {
          // Clear the initial message when we start receiving logs
          if (termRef.current) {
            termRef.current.write('\x1b[2J\x1b[H'); // Clear screen
          }

          const response = await fetchWithAuth(Endpoints.Updates.StreamLogs(), {
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) {
            console.error('Stream log request failed:', response.status);
            if (termRef.current) {
              termRef.current.writeln(
                `Error: Failed to stream logs (HTTP ${response.status})\r`,
              );
            }
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            console.error('No reader available');
            if (termRef.current) {
              termRef.current.writeln('Error: No reader available\r');
            }
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE format: lines starting with "data: " followed by JSON
            const bufferLines = buffer.split('\n');
            buffer = bufferLines.pop() || '';

            bufferLines.forEach((line) => {
              if (line.startsWith('data: ')) {
                try {
                  const jsonData = line.slice(6);
                  const logLines = JSON.parse(jsonData);
                  if (
                    termRef.current &&
                    Array.isArray(logLines) &&
                    logLines.length > 0
                  ) {
                    lineQueue.current = lineQueue.current.concat(logLines);
                    if (!isProcessing.current) {
                      processQueue();
                    }
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e, 'Line:', line);
                }
              }
            });
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('Stream log error:', error);
            if (termRef.current) {
              termRef.current.writeln(`Error: ${error.message}\r`);
            }
          }
        }
      };

      startStreaming();
    }, 200); // Small delay to ensure terminal is initialized

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isActive, lineAnimationDelay]);

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        backgroundColor: '#000',
        borderRadius: '8px',
        border: '1px solid #333',
        height: '400px',
        width: '100%',
      }}
      ref={terminalRef}
    />
  );
};

export default UpdateLogsTerminal;
