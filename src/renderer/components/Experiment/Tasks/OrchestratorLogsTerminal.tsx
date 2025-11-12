import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Sheet } from '@mui/joy';

// Debounce function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

interface OrchestratorLogsTerminalProps {
  requestId: string;
}

const OrchestratorLogsTerminal = ({
  requestId,
}: OrchestratorLogsTerminalProps) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleResize = debounce(() => {
    if (termRef.current) {
      fitAddon.current.fit();
    }
  }, 300);

  // Strip ANSI color codes for cleaner display (optional - you can keep them if xterm supports them well)
  const stripAnsiCodes = (text: string): string => {
    // Keep ANSI codes - xterm.js handles them natively
    return text;
  };

  useEffect(() => {
    // Initialize terminal
    termRef.current = new Terminal({
      smoothScrollDuration: 200,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
      convertEol: true, // Convert \n to \r\n automatically
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

    termRef.current.writeln('Connecting to orchestrator logs...\r\n');

    // Start streaming logs
    const streamLogs = async () => {
      try {
        abortControllerRef.current = new AbortController();

        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Jobs.GetLogs(requestId),
          {
            signal: abortControllerRef.current.signal,
          },
        );

        if (!response.ok) {
          termRef.current?.writeln(
            `\r\n\x1b[31mError: Failed to connect to log stream (${response.status})\x1b[0m\r\n`,
          );
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          termRef.current?.writeln(
            '\r\n\x1b[31mError: No response body\x1b[0m\r\n',
          );
          return;
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            termRef.current?.writeln('\r\n\x1b[32mStream completed\x1b[0m\r\n');
            break;
          }

          // Decode chunk
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete SSE messages
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            // Parse SSE format: "data: {...}"
            const dataMatch = line.match(/^data: (.+)$/m);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);

                if (data.log_line) {
                  // Write log line to terminal
                  const logLine = stripAnsiCodes(data.log_line);
                  termRef.current?.writeln(logLine);
                }

                if (data.status === 'completed') {
                  termRef.current?.writeln(
                    '\r\n\x1b[32m✓ Job launch completed\x1b[0m\r\n',
                  );
                  break;
                }

                if (data.error) {
                  termRef.current?.writeln(
                    `\r\n\x1b[31m✗ Error: ${data.error}\x1b[0m\r\n`,
                  );
                  break;
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          termRef.current?.writeln(
            `\r\n\x1b[31mError streaming logs: ${error.message}\x1b[0m\r\n`,
          );
        }
      }
    };

    streamLogs();

    return () => {
      // Cleanup
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      termRef.current?.dispose();
      termRef.current = null;
      if (terminalRef.current) {
        resizeObserver.unobserve(terminalRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [requestId]);

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

export default OrchestratorLogsTerminal;
